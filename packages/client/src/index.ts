/**
 * @ez-rpc/client — typed fetch client with HMAC signing, in-flight dedup,
 * retry/backoff, and NDJSON streaming support.
 */
export { createApiClient, invalidateUserIndexCache } from "./createApiClient.js";
export type { CreateApiClientOptions, StreamingOptions } from "./createApiClient.js";
