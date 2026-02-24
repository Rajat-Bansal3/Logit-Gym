import { AppError } from "./app-errors";

export enum MemberErrorCode {
	NOT_FOUND = "NOT_FOUND",
	ALREADY_EXISTS = "ALREADY_EXISTS",
	FORBIDDEN = "FORBIDDEN",
	BAD_REQUEST = "BAD_REQUEST",
	INVALID_STATUS = "INVALID_STATUS",
	NO_ACTIVE_MEMBERSHIP = "NO_ACTIVE_MEMBERSHIP",
	PAYMENT_REQUIRED = "PAYMENT_REQUIRED",
	ALREADY_ACTIVE = "ALREADY_ACTIVE",
}

const MEMBER_ERROR_STATUS: Record<MemberErrorCode, number> = {
	[MemberErrorCode.NOT_FOUND]: 404,
	[MemberErrorCode.ALREADY_EXISTS]: 409,
	[MemberErrorCode.FORBIDDEN]: 403,
	[MemberErrorCode.BAD_REQUEST]: 400,
	[MemberErrorCode.INVALID_STATUS]: 400,
	[MemberErrorCode.NO_ACTIVE_MEMBERSHIP]: 404,
	[MemberErrorCode.PAYMENT_REQUIRED]: 402,
	[MemberErrorCode.ALREADY_ACTIVE]: 409,
};

export class MemberError extends AppError {
	readonly code: MemberErrorCode;

	constructor(code: MemberErrorCode, message?: string, options?: { cause?: unknown }) {
		super(message ?? MemberError.defaultMessage(code), MEMBER_ERROR_STATUS[code], options);
		this.code = code;
	}

	private static defaultMessage(code: MemberErrorCode): string {
		switch (code) {
			case MemberErrorCode.NOT_FOUND:
				return "Member not found";
			case MemberErrorCode.ALREADY_EXISTS:
				return "Member already exists";
			case MemberErrorCode.FORBIDDEN:
				return "Access to member forbidden";
			case MemberErrorCode.BAD_REQUEST:
				return "Invalid member request";
			case MemberErrorCode.INVALID_STATUS:
				return "Invalid member status transition";
			case MemberErrorCode.NO_ACTIVE_MEMBERSHIP:
				return "Member has no active membership";
			case MemberErrorCode.PAYMENT_REQUIRED:
				return "Payment required for this operation";
			case MemberErrorCode.ALREADY_ACTIVE:
				return "Member is already active";
			default:
				return "Member error";
		}
	}
}
