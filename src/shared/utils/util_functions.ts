import type { NextFunction, Request, Response } from "express";
import { appLogger } from "./logger";

/**
 * Typed version for better TypeScript support
 */
export function catchAsync<T extends Request, U extends Response, V extends NextFunction>(
	fn: (req: T, res: U, next: V) => Promise<any>,
): (req: T, res: U, next: V) => void {
	return (req: T, res: U, next: V) => {
		Promise.resolve(fn(req, res, next)).catch((error) => {
			const logger = appLogger.withRequest(req);
			logger.error("Async error caught", {
				error: error.message,
				stack: error.stack,
				path: req.path,
				method: req.method,
			});
			next(error);
		});
	};
}
