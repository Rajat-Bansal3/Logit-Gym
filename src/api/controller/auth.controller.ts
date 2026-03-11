import type { NextFunction, Request, Response } from "express";
import { AuthError, AuthErrorCode } from "../../shared/errors/auth-errors";
import { loginSchema, registerSchema } from "../../shared/types/auth.types";
import { AppLogger } from "../../shared/utils/logger";
import { AuthService } from "../services/auth.service";

export class AuthController {
	private authService: AuthService;
	private logger: AppLogger;
	constructor() {
		this.authService = new AuthService();
		this.logger = new AppLogger();
	}
	login = async (req: Request, res: Response, _next: NextFunction) => {
		this.logger.debug("login request");
		const data = loginSchema.parse(req.body);
		const result = await this.authService.login(data);
		this.logger.debug("logged in complete for", result);

		res.status(200).json(result);
	};
	register = async (req: Request, res: Response, _next: NextFunction) => {
		const data = registerSchema.parse(req.body);
		const result = await this.authService.register(data);

		res.status(200).json(result);
	};
	me = async (req: Request, res: Response, _next: NextFunction) => {
		const user = req.user;
		if (!user) {
			throw new AuthError(AuthErrorCode.FORBIDDEN, "user not found");
		}
		return res.status(200).json(user);
	};
	// refresh = async (req: Request, res: Response, _next: NextFunction) => {};
	// logout = async (req: Request, res: Response, _next: NextFunction) => {};
}
