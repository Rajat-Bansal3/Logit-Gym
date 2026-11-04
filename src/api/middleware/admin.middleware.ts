import type { NextFunction, Request, Response } from "express";
import { env } from "../../env";
import { AuthError, AuthErrorCode } from "../../shared/errors/auth-errors";

const adminUserIds = new Set(
	env.ADMIN_USER_IDS.split(",")
		.map((id) => id.trim())
		.filter(Boolean),
);

export const isAdminUserId = (userId: string): boolean => adminUserIds.has(userId);

export const adminOnlyMiddleware = (req: Request, _res: Response, next: NextFunction) => {
	if (!req.user || !isAdminUserId(req.user.id)) {
		throw new AuthError(AuthErrorCode.FORBIDDEN, "Admin access is not enabled for this account.");
	}
	next();
};
