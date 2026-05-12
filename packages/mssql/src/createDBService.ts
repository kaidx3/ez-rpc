/**
 * createDBService — MSSQL query builder with automatic key mapping and Zod validation.
 *
 * This module requires `mssql` as a peer dependency.
 * It implements the builder pattern so services read like a clear pipeline:
 *
 * @example
 * export const getUsers = createDBService<{ orgIndex: string }>()
 *   .query((req, params) => req.query`
 *     SELECT * FROM dbo.view_Users WHERE OrgIndex = ${params.orgIndex}
 *   `)
 *   .output(z.array(UserSchema));
 *
 * // In a route handler:
 * const users = await getUsers(req.pool, { orgIndex: "123" });
 */
import sql, { IResult } from "mssql";
import { z, ZodArray, ZodObject, ZodTypeAny } from "zod";
import { createServiceError, createServiceOutputValidationError } from "@ez-rpc/core";
import { getCurrentUserIndex } from "./requestContext.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DBContext = sql.ConnectionPool | sql.Transaction;

type QueryFn = (req: sql.Request, ...args: unknown[]) => Promise<IResult<unknown>>;

type InferOutput<TSchema extends ZodTypeAny | undefined> =
    TSchema extends ZodArray<infer TItem> ? z.infer<TItem>[] : TSchema extends ZodTypeAny ? z.infer<TSchema> : unknown;

export type DBServiceFn<P, R> = (
    ...args: P extends void ? [context: DBContext] : [context: DBContext, params: P]
) => Promise<R>;

export type DBService<P = void, R = unknown> = DBServiceFn<P, R> & {
    query: <TParams = void>(
        fn: (req: sql.Request, ...args: TParams extends void ? [] : [TParams]) => Promise<IResult<unknown>>,
    ) => DBService<TParams, R>;
    output: <TSchema extends ZodArray<ZodTypeAny> | ZodTypeAny>(schema: TSchema) => DBService<P, InferOutput<TSchema>>;
    log: () => DBService<P, R>;
    _hasLogging?: boolean;
};

// ---------------------------------------------------------------------------
// Key mapping (DB PascalCase / snake_case → camelCase schema keys)
// ---------------------------------------------------------------------------

const schemaKeyMappingCache = new WeakMap<ZodObject<Record<string, ZodTypeAny>>, Map<string, string>>();
const precomputedSchemas = new WeakSet<ZodTypeAny>();

const normalizeKey = (key: string) => key.replace(/[_\s]+/g, "").toLowerCase();

const getSchemaKeyMapping = (schema: ZodObject<Record<string, ZodTypeAny>>): Map<string, string> => {
    let m = schemaKeyMappingCache.get(schema);
    if (m) return m;
    m = new Map<string, string>();
    for (const schemaKey of Object.keys(schema.shape)) {
        const norm = normalizeKey(schemaKey);
        if (!m.has(norm)) m.set(norm, schemaKey);
    }
    schemaKeyMappingCache.set(schema, m);
    return m;
};

export const precomputeSchemaKeyMappings = (schema: ZodTypeAny): void => {
    if (precomputedSchemas.has(schema)) return;
    precomputedSchemas.add(schema);
    if (schema instanceof ZodObject) getSchemaKeyMapping(schema);
    else if (schema instanceof ZodArray && schema.element instanceof ZodObject) getSchemaKeyMapping(schema.element);
};

/**
 * Builds a tight, memoized per-row key transformer for a result set.
 * The normalization runs once per unique raw column key, not once per row.
 */
export const buildRowTransformer = <T extends Record<string, unknown>>(
    schema: ZodTypeAny,
): ((item: T) => Record<string, unknown>) => {
    if (!(schema instanceof ZodObject)) return (item) => item;
    const mapping = getSchemaKeyMapping(schema);
    const resolved = new Map<string, string | null>();

    return (item: T): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const rawKey in item) {
            let schemaKey = resolved.get(rawKey);
            if (schemaKey === undefined) {
                schemaKey = mapping.get(normalizeKey(rawKey)) ?? null;
                resolved.set(rawKey, schemaKey);
            }
            if (schemaKey !== null) out[schemaKey] = item[rawKey];
        }
        return out;
    };
};

// ---------------------------------------------------------------------------
// Optional logging hook
// ---------------------------------------------------------------------------

type ServiceCallLogger = (
    context: DBContext,
    params: { orgMemberIndex: string; userId: string; action: string },
) => Promise<unknown>;

let serviceCallLogger: ServiceCallLogger | null = null;

/**
 * Register an optional service-call logger. When set, every `.log()`-enabled
 * service will record the query string and acting user.
 *
 * Call this once at server startup:
 * @example
 * registerServiceCallLogger(async (ctx, p) =>
 *   ctx.request().query`INSERT INTO dbo.ServiceCallLogs ...`
 * );
 */
export const registerServiceCallLogger = (logger: ServiceCallLogger): void => {
    serviceCallLogger = logger;
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

class DBServiceBuilder<P, TSchema extends ZodTypeAny | undefined, R = InferOutput<TSchema>> {
    private _queryFn?: QueryFn;
    private _schema?: TSchema;
    private _logging = false;

    query<TParams = void>(
        fn: (req: sql.Request, ...args: TParams extends void ? [] : [TParams]) => Promise<IResult<unknown>>,
    ): DBService<TParams, R> {
        const next = new DBServiceBuilder<TParams, TSchema, R>();
        next._queryFn = fn as QueryFn;
        if (this._schema !== undefined) next._schema = this._schema;
        next._logging = this._logging;
        return next.build();
    }

    output<TNewSchema extends ZodArray<ZodTypeAny> | ZodTypeAny>(
        schema: TNewSchema,
    ): DBService<P, InferOutput<TNewSchema>> {
        precomputeSchemaKeyMappings(schema);
        const next = new DBServiceBuilder<P, TNewSchema, InferOutput<TNewSchema>>();
        if (this._queryFn !== undefined) next._queryFn = this._queryFn;
        next._schema = schema;
        next._logging = this._logging;
        return next.build();
    }

    log(): DBService<P, R> {
        this._logging = true;
        return this.build();
    }

    build(): DBService<P, R> {
        const self = this;

        const service: DBServiceFn<P, R> = async (...args: [DBContext] | [DBContext, P]): Promise<R> => {
            const context = args[0];
            const params = args[1] as P | undefined;

            if (!self._queryFn) throw new Error("[ezRPC] No query function set on DBService");

            const queryArgs = params === undefined ? [] : [params];
            const userIndex = getCurrentUserIndex();

            if (self._logging && userIndex && serviceCallLogger) {
                const action = captureQueryString(self._queryFn, params);
                serviceCallLogger(context, { orgMemberIndex: "unknown", userId: userIndex, action }).catch((err) =>
                    console.error("[ezRPC] service call logging failed:", err),
                );
            }

            let data: sql.IRecordSet<unknown>;
            try {
                const result = await self._queryFn(context.request(), ...queryArgs);
                data = result.recordset;
            } catch (err) {
                throw createServiceError(err);
            }

            if (self._schema && self._schema instanceof z.ZodArray) {
                const itemSchema = self._schema.element;
                if (!data) {
                    return (itemSchema instanceof z.ZodNull ? [null] : []) as R;
                }

                const transform = buildRowTransformer(itemSchema);
                const transformed = data.map((row: unknown) => transform(row as Record<string, unknown>));
                const parseResult = self._schema.safeParse(transformed);

                if (parseResult.success) return parseResult.data as R;

                const errorSummary = parseResult.error.issues.reduce(
                    (acc, issue) => {
                        const field = issue.path.join(".").replace(/^\d+\./, "");
                        const key = `${field} - ${issue.message}`;
                        acc[key] = (acc[key] ?? 0) + 1;
                        return acc;
                    },
                    {} as Record<string, number>,
                );
                let errors = "";
                for (const [key, count] of Object.entries(errorSummary)) {
                    errors += `\n❌ ${count} occurrences of: "${key}"`;
                }
                throw createServiceOutputValidationError(errors);
            }

            return data as R;
        };

        (service as DBService<P, R>).query = self.query.bind(self);
        (service as DBService<P, R>).output = self.output.bind(self);
        (service as DBService<P, R>).log = self.log.bind(self);
        (service as DBService<P, R>)._hasLogging = self._logging;
        return service as DBService<P, R>;
    }
}

function captureQueryString<P>(queryFn: QueryFn, params: P | undefined): string {
    try {
        let captured = "";
        const mock = {
            query: (strings: TemplateStringsArray, ...values: unknown[]) => {
                captured = strings.reduce((r, s, i) => r + s + (values[i] !== undefined ? `'${values[i]}'` : ""), "");
                return Promise.resolve({ recordset: [] });
            },
        } as unknown as sql.Request;
        const queryArgs = params === undefined ? [] : [params];
        queryFn(mock, ...queryArgs).catch(() => {});
        return captured || "Unable to capture query";
    } catch {
        return "Unable to capture query";
    }
}

/**
 * Creates a new `DBService` builder chain for a given parameter type.
 *
 * @example
 * const getEmployee = createDBService<{ employeeId: string }>()
 *   .query((req, p) => req.query`SELECT * FROM dbo.view_Employees WHERE Id = ${p.employeeId}`)
 *   .output(z.array(EmployeeSchema));
 */
export const createDBService = <P = void>(): DBService<P, unknown> => new DBServiceBuilder<P, undefined>().build();
