/**
 * Express type augmentation for request properties added by @ez-rpc/router.
 *
 * Consumers should also augment `req.pool` (or similar) from their
 * DB adapter package (e.g. @ez-rpc/mssql).
 */
declare global {
  namespace Express {
    interface Request {
      /** Parsed and Zod-validated body attached by validateBody middleware. */
      input?: unknown;
      /** User identity set by your auth middleware. */
      userContext?: {
        userIndex: string;
        userName?: string;
      };
      rawBody?: Buffer;
    }
  }
}

export {};
