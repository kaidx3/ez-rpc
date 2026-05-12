/**
 * Optional injectable request context provider for @ez-rpc/mssql.
 *
 * Wire this up at server startup if you want `.log()`-enabled services to
 * record the acting user index. Works with @ez-rpc/router out of the box:
 *
 * @example
 * import { setCurrentUserIndexProvider } from "@ez-rpc/mssql";
 * import { getCurrentUserIndex } from "@ez-rpc/router";
 *
 * setCurrentUserIndexProvider(getCurrentUserIndex);
 */

let contextProvider: (() => string | undefined) | null = null;

/** Register a function that returns the current user's index for the active request. */
export const setCurrentUserIndexProvider = (provider: () => string | undefined): void => {
  contextProvider = provider;
};

/** Returns the current user index via the registered provider, or undefined if none registered. */
export const getCurrentUserIndex = (): string | undefined => contextProvider?.();
