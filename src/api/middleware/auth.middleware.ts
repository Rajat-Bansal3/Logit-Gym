import type { NextFunction, Request, Response } from "express";
import { AuthError, AuthErrorCode } from "../../shared/errors/auth-errors";
import { appLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import { AuthService } from "../services/auth.service";

const authService = new AuthService();

export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
	const logger = appLogger.withRequest(req);

	const token = req.header("Authorization")?.replace("Bearer ", "");

	if (!token) {
		logger.warn("Authentication failed: No token provided");
		throw new AuthError(AuthErrorCode.UNAUTHORIZED);
	}

	const validation = await authService.validateAccessToken(token);
	if (!validation.valid) {
		logger.warn("Authentication failed: Invalid token");
		throw new AuthError(AuthErrorCode.UNAUTHORIZED);
	}

	req.user = validation.user;
	if (req.user.gymId && !req.originalUrl.startsWith("/api/v1/admin")) {
		const gym = await client.gym.findUnique({
			where: { id: req.user.gymId },
			select: { isSuspended: true },
		});
		if (gym?.isSuspended) {
			throw new AuthError(AuthErrorCode.FORBIDDEN, "This gym account is suspended.");
		}
	}
	next();
};
