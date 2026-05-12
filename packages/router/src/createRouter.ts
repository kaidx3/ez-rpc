import express, { Request, Response, Router } from "express";
import { z, ZodSchema } from "zod";
import { Endpoint, createRouteOutputValidationError } from "@ez-rpc/core";
import { ConcurrencyQueue } from "@ez-rpc/concurrency";
import { safeRouteHandler } from "./safeRouteHandler.js";
import { validateBody } from "./validateBody.js";
import { sendApiResponse } from "./apiResponse.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouterEndpointConfig<TInput, TOutput> {
  handler:
    | ((input: TInput, req: Request, res: Response) => Promise<TOutput>)
    | ((input: TInput | TInput[], req: Request, res: Response) => Promise<TOutput>);
  middleware?: Array<(req: Request, res: Response, next: () => void) => Promise<unknown> | void>;
  /**
   * Set to `false` to skip the default authorization middleware.
   * Defaults to `true` (authorization runs unless opted out).
   */
  authorizeUser?: boolean;
  queue?: {
    queue: ConcurrencyQueue;
    key: (input: TInput, req: Request) => string;
  };
}

type ExtractInput<T> = T extends ZodSchema<infer I, never, never> ? I : undefined;

// ---------------------------------------------------------------------------
// In-flight deduplication
// ---------------------------------------------------------------------------

interface DedupEntry {
  response: unknown;
  duration: number;
}

const inflightRequests = new Map<string, Promise<DedupEntry>>();

const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_k, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
      return sorted;
    }
    return v;
  });

// ---------------------------------------------------------------------------
// Schema key mapping (DB snake_case → camelCase schema keys)
// ---------------------------------------------------------------------------

const schemaKeyMappingCache = new WeakMap<z.ZodObject<Record<string, z.ZodTypeAny>>, Map<string, string>>();
const precomputedSchemas = new WeakSet<z.ZodTypeAny>();

const normalizeKey = (key: string) => key.replace(/[_\s]+/g, "").toLowerCase();

const getSchemaKeyMapping = (schema: z.ZodObject<Record<string, z.ZodTypeAny>>): Map<string, string> => {
  let mapping = schemaKeyMappingCache.get(schema);
  if (mapping) return mapping;
  mapping = new Map<string, string>();
  for (const schemaKey of Object.keys(schema.shape)) {
    const normalized = normalizeKey(schemaKey);
    if (!mapping.has(normalized)) mapping.set(normalized, schemaKey);
  }
  schemaKeyMappingCache.set(schema, mapping);
  return mapping;
};

/**
 * Pre-warms the schema key mapping cache for an endpoint's input/output schemas.
 * Called automatically by `createRouter` so the hot path never pays the cost.
 */
export const precomputeSchemaKeyMappings = (schema: z.ZodTypeAny): void => {
  if (precomputedSchemas.has(schema)) return;
  precomputedSchemas.add(schema);
  if (schema instanceof z.ZodObject) {
    getSchemaKeyMapping(schema);
  } else if (schema instanceof z.ZodArray && schema.element instanceof z.ZodObject) {
    getSchemaKeyMapping(schema.element);
  }
};

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

/**
 * Creates a type-safe Express router from a contract endpoint map.
 *
 * Every key in `contractMap` must have a corresponding handler — TypeScript
 * enforces this at compile time. Provides:
 *
 * - Automatic Zod input validation (400 on failure)
 * - Automatic Zod output validation (500 on schema mismatch)
 * - In-flight request deduplication (identical concurrent POSTs resolve to one DB hit)
 * - Optional per-endpoint concurrency queuing
 * - Optional per-endpoint authorization middleware bypass
 *
 * @param contractMap  Map of endpoint definitions (Zod schemas + flags).
 * @param authMiddleware  Default authorization middleware applied to every route
 *                        unless a handler sets `authorizeUser: false`.
 *
 * @example
 * const router = createRouter(myEndpoints, authorizeUser).implement({
 *   getUsers: { handler: getUsersHandler },
 *   createUser: { handler: createUserHandler, authorizeUser: false },
 * });
 *
 * app.use("/users", router);
 */
export const createRouter = <TEndpoints extends Record<string, Endpoint<unknown, unknown>>>(
  contractMap: TEndpoints,
  authMiddleware?: (req: Request, res: Response, next: () => void) => Promise<unknown> | void,
) => {
  // Pre-warm schema caches on startup
  for (const endpoint of Object.values(contractMap)) {
    if (endpoint.input) precomputeSchemaKeyMappings(endpoint.input);
    if (endpoint.output) precomputeSchemaKeyMappings(endpoint.output);
  }

  return {
    implement: <
      THandlers extends {
        [K in keyof TEndpoints]: RouterEndpointConfig<
          TEndpoints[K]["input"] extends ZodSchema<unknown, never, never>
            ? z.output<TEndpoints[K]["input"]>
            : undefined,
          TEndpoints[K] extends { streaming: true }
            ? void
            : TEndpoints[K]["output"] extends ZodSchema<infer O>
              ? O
              : unknown
        >;
      },
    >(
      handlers: THandlers,
    ): Router => {
      const contractKeys = Object.keys(contractMap) as Array<keyof TEndpoints>;
      const handlerKeys = Object.keys(handlers) as Array<keyof THandlers>;

      for (const key of contractKeys) {
        if (!(key in handlers)) throw new Error(`[ezRPC] Missing handler for endpoint "${String(key)}"`);
      }
      for (const key of handlerKeys) {
        if (!(key in contractMap)) throw new Error(`[ezRPC] Handler for unknown endpoint "${String(key)}"`);
      }

      const router = express.Router();

      for (const key of contractKeys) {
        const contract = contractMap[key]!;
        const config = handlers[key]!;

        const chain: Array<(req: Request, res: Response, next: () => void) => void> = [];

        // Authorization
        if (config.authorizeUser !== false && authMiddleware) {
          chain.push(authMiddleware as (req: Request, res: Response, next: () => void) => void);
        }

        // Input validation
        if (contract.input) {
          chain.push(validateBody(contract.input));
        } else {
          chain.push((req, _res, next) => {
            req.input = undefined;
            next();
          });
        }

        // Extra per-route middleware
        if (config.middleware) chain.push(...config.middleware as Array<(req: Request, res: Response, next: () => void) => void>);

        chain.push(
          safeRouteHandler(async (req: Request, res: Response) => {
            const startTime = Date.now();
            const validatedInput = req.input as ExtractInput<typeof contract.input>;

            const invokeHandler = (): Promise<unknown> =>
              (config.handler as (input: unknown, req: Request, res: Response) => Promise<unknown>)(
                validatedInput,
                req,
                res,
              );

            const runWithQueue = config.queue
              ? () => {
                  const userId = req.userContext?.userIndex ?? "anonymous";
                  const queueKey = config.queue!.key(validatedInput as never, req);
                  return config.queue!.queue.run(invokeHandler, { userId, key: queueKey });
                }
              : invokeHandler;

            // Streaming — just invoke and return; the handler owns the response
            if (contract.streaming) {
              await invokeHandler();
              return;
            }

            // Deduplication
            const userId = req.userContext?.userIndex ?? "anonymous";
            const urlPath = req.originalUrl.split("?")[0]!;
            const dedupeKey = `${userId}||${urlPath}||${stableStringify(validatedInput ?? null)}`;

            let inflightPromise = inflightRequests.get(dedupeKey);
            if (!inflightPromise) {
              inflightPromise = runWithQueue()
                .then((rawResponse): DedupEntry => {
                  let validatedResponse: unknown = rawResponse;

                  if (contract.output) {
                    const parseResult = contract.output.safeParse(rawResponse);
                    if (parseResult.success) {
                      validatedResponse = parseResult.data;
                    } else {
                      const errorSummary = parseResult.error.issues.reduce(
                        (acc, issue) => {
                          const field = issue.path.join(".").replace(/^\d+\./, "");
                          const errorKey = `${field} - ${issue.message}`;
                          acc[errorKey] = (acc[errorKey] ?? 0) + 1;
                          return acc;
                        },
                        {} as Record<string, number>,
                      );
                      let errors = "";
                      for (const [errorKey, count] of Object.entries(errorSummary)) {
                        errors += `\n❌ ${count} occurrences of: "${errorKey}"`;
                      }
                      throw createRouteOutputValidationError(errors);
                    }
                  }

                  return {
                    response: {
                      success: true,
                      data: validatedResponse,
                      meta: {
                        timestamp: new Date().toISOString(),
                        duration: Date.now() - startTime,
                        ...(Array.isArray(validatedResponse) && {
                          isBatch: true,
                          count: validatedResponse.length,
                        }),
                      },
                    },
                    duration: Date.now() - startTime,
                  };
                })
                .finally(() => inflightRequests.delete(dedupeKey));

              inflightRequests.set(dedupeKey, inflightPromise);
            }

            const { response } = await inflightPromise;
            sendApiResponse(res, response as Parameters<typeof sendApiResponse>[1], 200);
          }),
        );

        router.post(`/${key as string}`, ...chain);
      }

      return router;
    },
  };
};

// ---------------------------------------------------------------------------
// createDBServiceHandler
// ---------------------------------------------------------------------------

/**
 * Wraps a DB service function as a simple route handler.
 *
 * Use this for straightforward single-query endpoints. For anything requiring
 * multi-step logic (multiple queries, blob ops, transformations) write a
 * dedicated handler function instead.
 *
 * @example
 * implement({
 *   getUsers: { handler: createDBServiceHandler(getUsersService) },
 * });
 */
export const createDBServiceHandler =
  <TInput, TOutput>(
    serviceFn: (context: unknown, params: TInput) => Promise<TOutput>,
  ) =>
  async (input: TInput, req: Request): Promise<TOutput> =>
    serviceFn((req as Request & { pool: unknown }).pool, input);
