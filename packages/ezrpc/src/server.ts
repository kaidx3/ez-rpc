/**
 * ezrpc/server — all server-side exports.
 *
 * Requires Node.js. Do not import in browser/client bundles.
 * Peer dependencies: express, zod. Optional peer: mssql.
 */

// Core
export type { Endpoint, EndpointMap, ApiResponse } from "@ez-rpc/core";
export {
  createServiceError,
  createRouteOutputValidationError,
  createServiceOutputValidationError,
  isServiceError,
} from "@ez-rpc/core";

// Concurrency
export { createConcurrencyQueue } from "@ez-rpc/concurrency";
export type {
  ConcurrencyQueue,
  ConcurrencyQueueOptions,
  ConcurrencyQueueRunOptions,
  ConcurrencyQueueStatus,
} from "@ez-rpc/concurrency";

// Router
export {
  createRouter,
  createDBServiceHandler,
  precomputeSchemaKeyMappings,
  sendApiResponse,
  handleRouteError,
  logValidationError,
  safeRouteHandler,
  validateBody,
  runWithRequestContext,
  getRequestContext,
  getCurrentUserIndex,
} from "@ez-rpc/router";
export type { ServerApiResponse, RequestContext } from "@ez-rpc/router";

// MSSQL adapter
export {
  createDBService,
  buildRowTransformer,
  registerServiceCallLogger,
  setCurrentUserIndexProvider,
} from "@ez-rpc/mssql";
export type { DBContext, DBService, DBServiceFn } from "@ez-rpc/mssql";
