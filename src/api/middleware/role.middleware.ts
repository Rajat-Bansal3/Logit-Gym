import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../../generated/enums";
import { AuthError, AuthErrorCode } from "@/shared/errors/auth-errors";

export const roleMiddleware = (role: UserRole) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user as { role?: string };

    if (!user || !user.role) {
      return new AuthError(AuthErrorCode.UNAUTHORIZED);
    }

    if (user.role !== role) {
      return new AuthError(AuthErrorCode.UNAUTHORIZED);
    }

    next();
    return;
  };
};
