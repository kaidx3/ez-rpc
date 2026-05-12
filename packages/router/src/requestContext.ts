import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userIndex?: string;
  userName?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a callback within a scoped request context.
 * Any async work spawned inside `fn` will see the same context via
 * `getRequestContext()` and `getCurrentUserIndex()`.
 */
export const runWithRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

/** Returns the active request context, or `undefined` if none is bound. */
export const getRequestContext = (): RequestContext | undefined => storage.getStore();

/** Convenience accessor for the current user's index. */
export const getCurrentUserIndex = (): string | undefined => storage.getStore()?.userIndex;
