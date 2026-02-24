import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../../env";
import { AppError } from "../../shared/errors/app-errors";
import { ValidationError } from "../../shared/errors/validation-errors";
import { appLogger } from "../../shared/utils/logger";

export const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction) => {
	const logger = appLogger.withRequest(req);
	let finalError = error;

	if (env.NODE_ENV === "production") {
		return res.status(500).json({
			error: "Internal Server Error",
			message: "Something went wrong",
		});
	}

	if (error instanceof ZodError) {
		finalError = new ValidationError(error);
	}

	if (finalError instanceof AppError) {
		return res.status(finalError.statusCode).json({
			status: "error",
			code: (finalError as any).code || "APP_ERROR",
			message: finalError.message,
			...(finalError instanceof ValidationError && {
				errors: finalError.errors,
			}),
			...(env.NODE_ENV !== "development" && { stack: finalError.stack }),
		});
	}
	if (error instanceof AppError) {
		return res.status(error.statusCode).json({
			error: error.name,
			message: error.message,
			...(env.NODE_ENV !== "development" && {
				stack: error.stack,
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
		error: error.message,
		stack: error.stack,
		path: req.path,
		method: req.method,
	});
};
