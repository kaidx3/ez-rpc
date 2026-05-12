/**
 * ezrpc/client — all client-side exports.
 *
 * Browser-safe. No Node.js or Express dependencies.
 * Peer dependencies: zod.
 */
export { createApiClient, invalidateUserIndexCache } from "@ez-rpc/client";
export type { CreateApiClientOptions, StreamingOptions } from "@ez-rpc/client";

// Core types are needed for defining contract endpoint maps in shared contract files
export type { Endpoint, EndpointMap, ApiResponse } from "@ez-rpc/core";
