import type { NextFunction, Request, Response } from "express";
import { AuthError, AuthErrorCode } from "../../shared/errors/auth-errors";
import { appLogger } from "../../shared/utils/logger";
import { AuthService } from "../services/auth.service";

const authService = new AuthService();

export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
	const logger = appLogger.withRequest(req);

	const token = req.header("Authorization")?.replace("Bearer ", "");

	if (!token) {
		logger.warn("Authentication failed: No token provided");
		throw new AuthError(AuthErrorCode.UNAUTHORIZED);
	}

	try {
		const validation = await authService.validateAccessToken(token);

		if (!validation.valid) {
			logger.warn("Authentication failed: Invalid token");
			throw new AuthError(AuthErrorCode.UNAUTHORIZED);
		}

		req.user = validation.user;
		logger.debug("User authenticated", { userId: validation.user.id });
		next();
		return;
	} catch (error) {
		logger.warn("Authentication failed", { error: error });
		throw new AuthError(AuthErrorCode.UNAUTHORIZED);
	}
};
