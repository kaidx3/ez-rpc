/**
 * Pure error factory functions with no framework dependencies.
 * These are used by both @ez-rpc/router (server-side) and @ez-rpc/mssql.
 */

/** Wraps an error or message as a named ServiceError. */
export const createServiceError = (err: unknown): Error => {
  const e = new Error(err instanceof Error ? err.message : String(err));
  e.name = "ServiceError";
  return e;
};

/** Wraps an error as a RouteOutputValidationError (output schema mismatch). */
export const createRouteOutputValidationError = (err: unknown): Error => {
  const e = new Error(err instanceof Error ? err.message : String(err));
  e.name = "RouteOutputValidationError";
  return e;
};

/** Wraps an error as a ServiceOutputValidationError (DB result schema mismatch). */
export const createServiceOutputValidationError = (err: unknown): Error => {
  const e = new Error(err instanceof Error ? err.message : String(err));
  e.name = "ServiceOutputValidationError";
  return e;
};

/** Returns true if the error message contains "SERVICE ERROR". */
export const isServiceError = (message: string): boolean =>
  message.includes("SERVICE ERROR");
