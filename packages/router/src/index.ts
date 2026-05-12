/**
 * @ez-rpc/router — type-safe Express router with Zod validation,
 * in-flight deduplication, and optional concurrency queuing.
 */
export { createRouter, createDBServiceHandler, precomputeSchemaKeyMappings } from "./createRouter.js";
export { sendApiResponse } from "./apiResponse.js";
export type { ServerApiResponse } from "./apiResponse.js";
export { handleRouteError, logValidationError } from "./errorHandling.js";
export { safeRouteHandler } from "./safeRouteHandler.js";
export { validateBody } from "./validateBody.js";
export {
  runWithRequestContext,
  getRequestContext,
  getCurrentUserIndex,
} from "./requestContext.js";
export type { RequestContext } from "./requestContext.js";

// Re-export error factories from @ez-rpc/core for convenience
export {
  createServiceError,
  createRouteOutputValidationError,
  createServiceOutputValidationError,
  isServiceError,
} from "@ez-rpc/core";
