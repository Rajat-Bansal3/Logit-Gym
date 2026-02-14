import type { NextFunction, Request, Response } from "express";
import { appLogger } from "../../shared/utils/logger";

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction) => {
	const logger = appLogger.withRequest(req);

	logger.warn("Route not found", {
		path: req.path,
		method: req.method,
		query: req.query,
	});

	res.status(404).json({
		error: "Not Found",
		message: `Route ${req.method} ${req.path} not found`,
	});
};
