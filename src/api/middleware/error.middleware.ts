import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../../shared/errors/app-errors";
import { mapPrismaError } from "../../shared/errors/prisma-error.mapper";
import { ValidationError } from "../../shared/errors/validation-errors";
import { appLogger } from "../../shared/utils/logger";

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Central error handler. The rule is simple: operational errors (AppError
 * and its subclasses, plus known Prisma/Zod errors we translate below) are
 * safe, user-authored messages and are always shown to the client — in every
 * environment. Anything else is unexpected/internal (raw Prisma errors, bugs,
 * etc.) and must never leak its message or stack to the client; it's logged
 * server-side instead and the client only sees a generic message.
 */
export const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction) => {
	const logger = appLogger.withRequest(req);

	let finalError: Error = error;

	if (error instanceof ZodError) {
		finalError = new ValidationError(error);
	} else if (!(error instanceof AppError)) {
		finalError = mapPrismaError(error) ?? error;
	}

	if (finalError instanceof AppError) {
		return res.status(finalError.statusCode).json({
			status: "error",
			code: (finalError as any).code || "APP_ERROR",
			message: finalError.message,
			...(finalError instanceof ValidationError && {
				errors: finalError.errors,
			}),
		});
	}

	logger.error("Unhandled error occurred", {
		error: error.message,
		stack: error.stack,
		path: req.path,
		method: req.method,
	});

	return res.status(500).json({
		status: "error",
		code: "INTERNAL_ERROR",
		message: GENERIC_ERROR_MESSAGE,
	});
};
