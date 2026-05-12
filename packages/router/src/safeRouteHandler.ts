import { Request, Response } from "express";
import { handleRouteError } from "./errorHandling.js";

/**
 * Wraps an async Express route handler with centralized error handling.
 *
 * Catches any thrown error and delegates to `handleRouteError`. If headers
 * have already been sent (e.g. mid-stream), the error is logged but the
 * response is not touched.
 *
 * @example
 * router.post("/myRoute", safeRouteHandler(async (req, res) => {
 *   res.json({ ok: true });
 * }));
 */
export const safeRouteHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (!res.headersSent) {
        handleRouteError(req, res, err);
      } else {
        console.error(
          `[safeRouteHandler] error after headers sent on ${req.method} ${req.originalUrl}:`,
          err instanceof Error ? err.stack ?? err.message : err,
        );
        if (!res.writableEnded && !res.destroyed) {
          res.end();
        }
      }
    }
  };
