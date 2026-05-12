import { Request, Response } from "express";
import { sendApiResponse } from "./apiResponse.js";

export {
    createServiceError,
    createRouteOutputValidationError,
    createServiceOutputValidationError,
    isServiceError,
} from "@ez-rpc/core";

const RED = "\x1b[91m";
const WHITE = "\x1b[97m";
const RESET = "\x1b[0m";

interface ExtendedError extends Error {
    code?: string;
    details?: Record<string, unknown>;
    databaseErrors?: Array<{
        code: string;
        message: string;
        details?: Record<string, unknown>;
        constraint?: string;
        table?: string;
        column?: string;
        state?: string;
    }>;
}

const tag = (label: string) => `${WHITE}[${RED}${label}${WHITE}]${RESET}`;

/**
 * Logs a validation error to the console with structured formatting.
 */
export const logValidationError = (req: Request, error: unknown): void => {
    console.error(`\n${tag("VALIDATION ERROR")} ${req.method} ${req.originalUrl}\n`, error);
};

/**
 * Central Express error handler. Reads known error names to choose the right
 * response shape and status code.
 */
export const handleRouteError = (req: Request, res: Response, err: unknown): void => {
    if (res.headersSent) return;

    if (err instanceof Error) {
        const ext = err as ExtendedError;
        const label =
            err.name === "ServiceError"
                ? tag("SERVICE ERROR")
                : err.name === "RouteOutputValidationError"
                  ? tag("ROUTE OUTPUT VALIDATION ERROR")
                  : err.name === "ServiceOutputValidationError"
                    ? tag("SERVICE OUTPUT VALIDATION ERROR")
                    : tag("ERROR");

        console.error(`\n${label} ${req.method} ${req.originalUrl}\n${err.stack ?? err.message}\n`);

        sendApiResponse(
            res,
            {
                success: false,
                error: {
                    message: err.message,
                    code: ext.code ?? err.name,
                    ...(ext.details && { details: ext.details }),
                    ...(ext.databaseErrors && { databaseErrors: ext.databaseErrors }),
                },
                meta: { timestamp: new Date().toISOString() },
            },
            500,
        );
    } else {
        sendApiResponse(
            res,
            {
                success: false,
                error: { message: "An unexpected error occurred", code: "INTERNAL_ERROR" },
                meta: { timestamp: new Date().toISOString() },
            },
            500,
        );
    }
};
