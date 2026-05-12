import { Endpoint, ApiResponse } from "@ez-rpc/core";
import { ZodSchema, ZodAny } from "zod";

// ---------------------------------------------------------------------------
// Response type helpers
// ---------------------------------------------------------------------------

type InferredResponse<TOutput> =
  TOutput extends ZodSchema<infer O>
    ? TOutput extends ZodAny
      ? ApiResponse
      : O extends null | undefined | void
        ? ApiResponse<void>
        : ApiResponse<O>
    : ApiResponse<void>;

type InferredStreamResponse<TOutput> =
  TOutput extends ZodSchema<never, never, never> ? ApiResponse<import("zod").output<TOutput>[]> : ApiResponse<unknown[]>;

// ---------------------------------------------------------------------------
// Endpoint function shapes
// ---------------------------------------------------------------------------

type StandardEndpointFn<E extends Endpoint<unknown, unknown>> = (E["input"] extends ZodSchema<infer I>
  ? undefined extends I
    ? (input?: I) => Promise<InferredResponse<E["output"]>>
    : (input: I) => Promise<InferredResponse<E["output"]>>
  : () => Promise<InferredResponse<E["output"]>>) & {
  inputSchema?: E["input"];
  outputSchema?: E["output"];
};

/** Optional callbacks for streaming endpoints. */
export interface StreamingOptions {
  signal?: AbortSignal;
  /** Fires every `PROGRESS_NOTIFY_INTERVAL` rows as they accumulate. */
  onProgress?: (rowsReceived: number) => void;
  /** Fires for each `_status` line emitted by the server (e.g. "queued", "executing"). */
  onStatusMessage?: (message: string) => void;
}

type StreamingEndpointFn<E extends Endpoint<unknown, unknown>> = (E["input"] extends ZodSchema<infer I>
  ? (input: I, options?: StreamingOptions) => Promise<InferredStreamResponse<E["output"]>>
  : (input: undefined, options?: StreamingOptions) => Promise<InferredStreamResponse<E["output"]>>) & {
  inputSchema?: E["input"];
  outputSchema?: E["output"];
  streaming: true;
};

type EndpointFn<E extends Endpoint<unknown, unknown>> = E extends { streaming: true }
  ? StreamingEndpointFn<E>
  : StandardEndpointFn<E>;

type ClientFromEndpoints<T extends Record<string, Endpoint<unknown, unknown>>> = {
  [K in keyof T]: EndpointFn<T[K]>;
};

// ---------------------------------------------------------------------------
// Auth / signing helpers
// ---------------------------------------------------------------------------

let cachedUserIndex: string | null | undefined;
let tokenOverride: string | null | undefined;

/** Clears the cached user index. Call this on login/logout. */
export const invalidateUserIndexCache = (): void => {
  cachedUserIndex = undefined;
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "userIndex" || event.key === null) cachedUserIndex = undefined;
  });
}

const getLocalUserIndex = (): string | null => {
  if (typeof window === "undefined") return null;
  if (tokenOverride === undefined) {
    const token = new URLSearchParams(window.location.search).get("token");
    tokenOverride = token ? `token:${token}` : null;
  }
  if (tokenOverride) return tokenOverride;
  if (cachedUserIndex === undefined) cachedUserIndex = localStorage.getItem("userIndex");
  return cachedUserIndex;
};

// ---------------------------------------------------------------------------
// HMAC signing (mirrors server's authorizeUser middleware)
// ---------------------------------------------------------------------------

let hmacKeyPromise: Promise<CryptoKey> | null = null;

const getHmacKey = (appSecret: string): Promise<CryptoKey> => {
  if (!hmacKeyPromise) {
    hmacKeyPromise = window.crypto.subtle
      .importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .catch((err: unknown) => {
        hmacKeyPromise = null;
        throw err;
      });
  }
  return hmacKeyPromise;
};

const generateSignature = async (
  method: string,
  pathname: string,
  bodyString: string,
  timestamp: string,
  appSecret: string,
): Promise<string> => {
  const data = `${method}:${pathname}:${bodyString}:${timestamp}`;
  const key = await getHmacKey(appSecret);
  const buf = await window.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const buildAuthHeaders = async (
  pathname: string,
  bodyString: string,
  accept: string,
  appSecret: string,
): Promise<Record<string, string>> => {
  const timestamp = Date.now().toString();
  const signature = await generateSignature("POST", pathname, bodyString, timestamp, appSecret);
  return {
    Authorization: `Bearer ${getLocalUserIndex()}`,
    "Content-Type": "application/json",
    Accept: accept,
    "x-request-timestamp": timestamp,
    "x-request-signature": signature,
  };
};

// ---------------------------------------------------------------------------
// Stable stringify (for dedup keys)
// ---------------------------------------------------------------------------

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
// Retry / timeout
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 250;

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const postRequest = async (
  route: string,
  pathname: string,
  bodyString: string,
  accept: string,
  appSecret: string,
  signal?: AbortSignal,
): Promise<Response> => {
  const headers = await buildAuthHeaders(pathname, bodyString, accept, appSecret);
  return fetch(route, {
    method: "POST",
    headers,
    body: bodyString === "" ? undefined : bodyString,
    signal,
  });
};

const postRequestWithRetry = async (
  route: string,
  pathname: string,
  bodyString: string,
  accept: string,
  appSecret: string,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number | false,
  maxRetries: number,
): Promise<Response> => {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (callerSignal?.aborted) throw new DOMException("Aborted", "AbortError");

    const timeoutController = timeoutMs === false ? null : new AbortController();
    const timer = timeoutController
      ? setTimeout(
          () => timeoutController.abort(new DOMException("Request timed out", "TimeoutError")),
          timeoutMs as number,
        )
      : null;
    const onCallerAbort = () => timeoutController?.abort(new DOMException("Aborted", "AbortError"));
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      return await postRequest(route, pathname, bodyString, accept, appSecret, timeoutController?.signal);
    } catch (err) {
      if (callerSignal?.aborted) throw err;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
      const isNetwork = err instanceof TypeError;
      if (attempt >= maxRetries || (!isAbort && !isTimeout && !isNetwork)) throw err;
      attempt++;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(3, attempt - 1) * (0.75 + Math.random() * 0.5);
      await wait(delay, callerSignal);
    } finally {
      if (timer) clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }
};

// ---------------------------------------------------------------------------
// Response handling
// ---------------------------------------------------------------------------

const PROGRESS_NOTIFY_INTERVAL = 250;

async function handleJsonResponse<T>(
  response: Response,
  schema?: ZodSchema<T>,
  endpointName?: string,
): Promise<ApiResponse<T>> {
  try {
    const json = await response.json() as Record<string, unknown>;
    const status = (json["status"] as number | undefined) ?? response.status;

    if (!response.ok) return { ...(json as ApiResponse<T>), status, success: json["success"] === true };

    if (schema && json["success"] && json["data"] !== undefined) {
      const result = schema.safeParse(json["data"]);
      if (!result.success) {
        console.group("🚨 API Response Validation Failed");
        console.error("Endpoint:", endpointName ?? "Unknown");
        console.error("Validation Errors:", result.error.format());
        console.error("Response Data:", json["data"]);
        console.groupEnd();
        return {
          success: false,
          status,
          error: {
            message: "Invalid data format received from API",
            code: "VALIDATION_ERROR",
            validationErrors: result.error.format() as Record<string, unknown>,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }
      return { success: true, status, data: result.data };
    }

    return { ...(json as ApiResponse<T>), status };
  } catch {
    return {
      success: false,
      status: 500,
      error: { message: "Unexpected error during API response handling", code: "CLIENT_ERROR" },
      meta: { timestamp: new Date().toISOString() },
    };
  }
}

async function consumeNdjsonStream<TRow>(
  response: Response,
  rowSchema: ZodSchema<TRow> | undefined,
  options: StreamingOptions | undefined,
  endpointName: string,
): Promise<ApiResponse<TRow[]>> {
  const startedAt = Date.now();
  const status = response.status;

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      success: false,
      status,
      error: { message: `Stream failed (${status}): ${errorText || response.statusText}`, code: "STREAM_HTTP_ERROR" },
      meta: { timestamp: new Date().toISOString() },
    };
  }
  if (!response.body) {
    return {
      success: false,
      status,
      error: { message: "Server returned no response body for stream", code: "STREAM_NO_BODY" },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const rows: TRow[] = [];
  const statusMessages: string[] = [];
  let buffer = "";
  let lastNotify = 0;
  let validationFailures = 0;

  try {
    let done = false;
    while (!done) {
      if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const chunk = await reader.read();
      done = chunk.done;
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          continue;
        }

        if ("_streamError" in parsed) {
          return {
            success: false,
            status,
            error: { message: `Server streaming error: ${String(parsed["_streamError"])}`, code: "STREAM_ERROR" },
            meta: { timestamp: new Date().toISOString(), duration: Date.now() - startedAt, statusMessages },
          };
        }
        if ("_status" in parsed) {
          const msg = String(parsed["_status"]);
          statusMessages.push(msg);
          options?.onStatusMessage?.(msg);
          continue;
        }

        if (rowSchema) {
          const result = rowSchema.safeParse(parsed);
          if (result.success) rows.push(result.data);
          else validationFailures++;
        } else {
          rows.push(parsed as TRow);
        }

        if (rows.length - lastNotify >= PROGRESS_NOTIFY_INTERVAL) {
          lastNotify = rows.length;
          options?.onProgress?.(rows.length);
        }
      }
    }
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    return {
      success: false,
      status,
      error: {
        message: isAbort ? "Stream aborted" : err instanceof Error ? err.message : "Unknown stream error",
        code: isAbort ? "STREAM_ABORTED" : "STREAM_ERROR",
      },
      meta: { timestamp: new Date().toISOString(), duration: Date.now() - startedAt, statusMessages },
    };
  } finally {
    reader.releaseLock();
  }

  if (validationFailures > 0) {
    console.warn(`[${endpointName}] ${validationFailures} streamed row(s) failed schema validation and were dropped.`);
  }

  options?.onProgress?.(rows.length);
  return {
    success: true,
    status,
    data: rows,
    meta: {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startedAt,
      isBatch: true,
      count: rows.length,
      statusMessages,
    },
  };
}

// ---------------------------------------------------------------------------
// createApiClient options
// ---------------------------------------------------------------------------

export interface CreateApiClientOptions {
  /** Base URL of the API server. Defaults to `process.env.NEXT_PUBLIC_API_URL` or `http://localhost:3001`. */
  baseUrl?: string;
  /**
   * Shared secret used to sign request signatures (must match the server's `APP_SECRET`).
   * Defaults to `process.env.NEXT_PUBLIC_APP_SECRET`.
   */
  appSecret?: string;
}

const inflightClientRequests = new Map<string, Promise<ApiResponse<unknown>>>();

// ---------------------------------------------------------------------------
// createApiClient
// ---------------------------------------------------------------------------

/**
 * Generates a fully-typed fetch client from a contract endpoint map.
 *
 * - Standard endpoints POST JSON and resolve to `ApiResponse<TOutput>`.
 * - Streaming endpoints consume NDJSON and resolve to `ApiResponse<TOutput[]>`.
 * - Duplicate in-flight requests are deduplicated (one fetch per unique input).
 * - Requests are HMAC-signed to match the server's `authorizeUser` middleware.
 *
 * @example
 * export const userApi = createApiClient(userEndpoints, "/user", {
 *   baseUrl: process.env.NEXT_PUBLIC_API_URL,
 * });
 *
 * const { data } = await userApi.getUsers();
 */
export const createApiClient = <T extends Record<string, Endpoint<unknown, unknown>>>(
  endpoints: T,
  prefix: string,
  options: CreateApiClientOptions = {},
): { prefix: string } & ClientFromEndpoints<T> => {
  const baseUrl =
    options.baseUrl ??
    (typeof process !== "undefined" ? process.env["NEXT_PUBLIC_API_URL"] : undefined) ??
    "http://localhost:3001";
  const appSecret =
    options.appSecret ??
    (typeof process !== "undefined" ? process.env["NEXT_PUBLIC_APP_SECRET"] : undefined) ??
    "ezrpc_secret";

  const client = Object.fromEntries(
    Object.entries(endpoints).map(([key, endpoint]) => {
      const route = `${baseUrl}${prefix}/${key}`;
      const pathname =
        typeof window !== "undefined"
          ? new URL(route, window.location.origin).pathname
          : new URL(route, "http://localhost").pathname;

      const timeoutMs: number | false = endpoint.timeoutMs ?? (endpoint.streaming ? false : DEFAULT_TIMEOUT_MS);
      const maxRetries =
        endpoint.retry === false ? 0 : (endpoint.retry ?? (endpoint.streaming ? 0 : DEFAULT_RETRIES));

      const fn = endpoint.streaming
        ? async (input: unknown, streamOptions?: StreamingOptions) => {
            const bodyString = input !== undefined ? stableStringify(input) : "";
            const response = await postRequestWithRetry(
              route,
              pathname,
              bodyString,
              "application/x-ndjson",
              appSecret,
              streamOptions?.signal,
              timeoutMs,
              maxRetries,
            );
            return consumeNdjsonStream(response, endpoint.output as ZodSchema<unknown> | undefined, streamOptions, key);
          }
        : async (input?: unknown) => {
            const bodyString = input !== undefined ? stableStringify(input) : "";
            const dedupeKey = `${route}||${bodyString || "null"}`;
            const existing = inflightClientRequests.get(dedupeKey);
            if (existing) return existing;
            const promise = postRequestWithRetry(
              route,
              pathname,
              bodyString,
              "application/json",
              appSecret,
              undefined,
              timeoutMs,
              maxRetries,
            )
              .then((response) => handleJsonResponse(response, endpoint.output as ZodSchema<unknown> | undefined, key))
              .finally(() => inflightClientRequests.delete(dedupeKey));
            inflightClientRequests.set(dedupeKey, promise as Promise<ApiResponse<unknown>>);
            return promise;
          };

      Object.assign(fn, {
        inputSchema: endpoint.input,
        outputSchema: endpoint.output,
        ...(endpoint.streaming && { streaming: true }),
      });

      return [key, fn];
    }),
  ) as ClientFromEndpoints<T>;

  return { prefix, ...client };
};
