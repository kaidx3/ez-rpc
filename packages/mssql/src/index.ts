/**
 * @ez-rpc/mssql — MSSQL adapter with automatic PascalCase → camelCase key mapping
 * and Zod output validation. Pairs with @ez-rpc/router but usable standalone.
 *
 * Wire up the request context at startup for user-aware logging:
 * @example
 * import { setCurrentUserIndexProvider } from "@ez-rpc/mssql";
 * import { getCurrentUserIndex } from "@ez-rpc/router";
 * setCurrentUserIndexProvider(getCurrentUserIndex);
 */
export { createDBService, buildRowTransformer, precomputeSchemaKeyMappings, registerServiceCallLogger } from "./createDBService.js";
export type { DBContext, DBService, DBServiceFn } from "./createDBService.js";
export { setCurrentUserIndexProvider } from "./requestContext.js";
