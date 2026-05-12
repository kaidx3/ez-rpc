/**
 * @ez-rpc/core — shared types and error primitives.
 * Safe to import in any context (browser, Node.js, edge).
 */
export type { Endpoint, EndpointMap, ApiResponse } from "./types.js";
export {
  createServiceError,
  createRouteOutputValidationError,
  createServiceOutputValidationError,
  isServiceError,
} from "./errors.js";
