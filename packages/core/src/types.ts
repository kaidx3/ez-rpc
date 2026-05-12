import { ZodSchema } from "zod";

/**
 * Defines the shape of a single API endpoint.
 *
 * Both `input` and `output` are optional — omit them entirely when no
 * validation is needed. Never pass `z.object({})` as a placeholder.
 *
 * Set `streaming: true` for NDJSON streaming endpoints. The client will
 * consume the stream and resolve to `ApiResponse<TOutput[]>`.
 */
export interface Endpoint<TInput = unknown, TOutput = unknown> {
  input?: ZodSchema<TInput>;
  output?: ZodSchema<TOutput>;
  streaming?: boolean;
  /** Per-attempt fetch timeout in ms. Set `false` to disable. Default: 5 min. */
  timeoutMs?: number | false;
  /** Max retry attempts on network failure. Set `false` to disable. Default: 1. */
  retry?: number | false;
}

export type EndpointMap = Record<string, Endpoint<unknown, unknown>>;

/**
 * Standard response envelope returned by every ezRPC endpoint.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  status: number;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
    validationErrors?: Record<string, unknown>;
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
  meta?: {
    isBatch?: boolean;
    count?: number;
    timestamp?: string;
    duration?: number;
    statusMessages?: string[];
    [key: string]: unknown;
  };
}
