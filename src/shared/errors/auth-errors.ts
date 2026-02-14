import { AppError } from "./app-errors";

export enum AuthErrorCode {
	UNAUTHORIZED = "UNAUTHORIZED",
	FORBIDDEN = "FORBIDDEN",
	NOT_FOUND = "NOT_FOUND",
	CONFLICT = "CONFLICT",
	BAD_REQUEST = "BAD_REQUEST",
}

const AUTH_ERROR_STATUS: Record<AuthErrorCode, number> = {
	[AuthErrorCode.UNAUTHORIZED]: 401,
	[AuthErrorCode.FORBIDDEN]: 403,
	[AuthErrorCode.NOT_FOUND]: 404,
	[AuthErrorCode.CONFLICT]: 409,
	[AuthErrorCode.BAD_REQUEST]: 400,
};

export class AuthError extends AppError {
	readonly code: AuthErrorCode;

	constructor(code: AuthErrorCode, message?: string, options?: { cause?: unknown }) {
		super(message ?? AuthError.defaultMessage(code), AUTH_ERROR_STATUS[code], options);

		this.code = code;
	}

	private static defaultMessage(code: AuthErrorCode): string {
		switch (code) {
			case AuthErrorCode.UNAUTHORIZED:
				return "Unauthorized";
			case AuthErrorCode.FORBIDDEN:
				return "Forbidden";
			case AuthErrorCode.NOT_FOUND:
				return "Resource not found";
			case AuthErrorCode.CONFLICT:
				return "Conflict";
			case AuthErrorCode.BAD_REQUEST:
				return "Bad request";
			default:
				return "Authentication error";
		}
	}
}
