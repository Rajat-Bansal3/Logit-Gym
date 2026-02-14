import { AppError } from "./app-errors";

export enum UserErrorCode {
	UNAUTHORIZED = "UNAUTHORIZED",
	NOT_FOUND = "NOT_FOUND",
	SETTINGS_NOT_FOUND = "SETTINGS_NOT_FOUND",
	GOAL_NOT_FOUND = "GOAL_NOT_FOUND",
	CONFLICT = "CONFLICT",
	BAD_REQUEST = "BAD_REQUEST",
	FORBIDDEN = "FORBIDDEN",
	INVALID_INPUT = "INVALID_INPUT",
}

const USER_ERROR_STATUS: Record<UserErrorCode, number> = {
	[UserErrorCode.UNAUTHORIZED]: 401,
	[UserErrorCode.NOT_FOUND]: 404,
	[UserErrorCode.SETTINGS_NOT_FOUND]: 404,
	[UserErrorCode.GOAL_NOT_FOUND]: 404,
	[UserErrorCode.CONFLICT]: 409,
	[UserErrorCode.BAD_REQUEST]: 400,
	[UserErrorCode.FORBIDDEN]: 403,
	[UserErrorCode.INVALID_INPUT]: 400,
};

export class UserError extends AppError {
	readonly code: UserErrorCode;

	constructor(code: UserErrorCode, message?: string, options?: { cause?: unknown }) {
		super(message ?? UserError.defaultMessage(code), USER_ERROR_STATUS[code], options);
		this.code = code;
	}

	private static defaultMessage(code: UserErrorCode): string {
		switch (code) {
			case UserErrorCode.UNAUTHORIZED:
				return "Unauthorized";
			case UserErrorCode.NOT_FOUND:
				return "User not found";
			case UserErrorCode.SETTINGS_NOT_FOUND:
				return "User settings not found";
			case UserErrorCode.GOAL_NOT_FOUND:
				return "User goal not found";
			case UserErrorCode.CONFLICT:
				return "Conflict";
			case UserErrorCode.BAD_REQUEST:
				return "Bad request";
			case UserErrorCode.FORBIDDEN:
				return "Forbidden";
			case UserErrorCode.INVALID_INPUT:
				return "Invalid input";
			default:
				return "User error";
		}
	}
}
