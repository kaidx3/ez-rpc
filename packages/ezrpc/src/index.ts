/**
 * ezrpc — shared types and error primitives (safe for any environment).
 *
 * For server-only exports, import from "ez-rpc/server".
 * For client-only exports, import from "ez-rpc/client".
 */
export type { Endpoint, EndpointMap, ApiResponse } from "@ez-rpc/core";
export {
  createServiceError,
  createRouteOutputValidationError,
  createServiceOutputValidationError,
  isServiceError,
} from "@ez-rpc/core";
