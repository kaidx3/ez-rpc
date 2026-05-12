import { Response } from "express";
import { ApiResponse } from "@ez-rpc/core";
import { ZodFormattedError } from "zod";

export type { ApiResponse };

export interface ServerApiResponse<T = unknown> extends ApiResponse<T> {
  error?: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
    validationErrors?: ZodFormattedError<unknown>;
    databaseErrors?: Array<{
      code: string;
      message: string;
      details?: Record<string, unknown>;
      constraint?: string;
      table?: string;
      column?: string;
      state?: string;
    }>;
  };
}

/**
 * Sends a standardized JSON response envelope.
 * Automatically adds batch metadata (`isBatch`, `count`) for array payloads.
 * Sets `Cache-Control: no-store` unless the caller has already set it.
 */
export const sendApiResponse = <T>(
  res: Response,
  response: Omit<ServerApiResponse<T>, "status">,
  status: number,
): void => {
  if (Array.isArray(response.data) && !response.meta) {
    response.meta = {
      isBatch: true,
      count: (response.data as unknown[]).length,
      timestamp: new Date().toISOString(),
    };
  }

  if (!res.getHeader("Cache-Control")) {
    res.setHeader("Cache-Control", "no-store");
  }

  res.status(status).json({ ...response, status });
};
