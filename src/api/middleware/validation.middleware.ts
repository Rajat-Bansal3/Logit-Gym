import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { appLogger } from "../../shared/utils/logger";

export const validate = (schema: ZodSchema) => {
	return (req: Request, res: Response, next: NextFunction) => {
		const logger = appLogger.withRequest(req);

		try {
			const result = schema.parse(req.body);
			req.body = result;
			next();
		} catch (error: any) {
			logger.warn("Validation failed", {
				errors: error.errors,
				path: req.path,
			});

			res.status(400).json({
				error: "Validation failed",
				details: error.errors,
			});
		}
	};
};
