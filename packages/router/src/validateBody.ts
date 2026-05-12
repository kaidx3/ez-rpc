import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { sendApiResponse } from "./apiResponse.js";
import { logValidationError } from "./errorHandling.js";

/**
 * Express middleware that validates `req.body` against a Zod schema.
 *
 * On success the parsed, coerced value is attached to `req.input` and
 * `next()` is called. On failure a structured 400 response is sent.
 */
export const validateBody =
    (schema: z.ZodSchema) =>
    (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            logValidationError(req, result.error);
            sendApiResponse(
                res,
                {
                    success: false,
                    error: {
                        message: "Validation failed",
                        code: "VALIDATION_ERROR",
                        validationErrors: result.error.format(),
                    },
                    meta: { timestamp: new Date().toISOString() },
                },
                400,
            );
            return;
        }
        req.input = result.data;
        next();
    };
