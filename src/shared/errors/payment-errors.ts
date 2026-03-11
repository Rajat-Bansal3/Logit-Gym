import { AppError } from "./app-errors";

export enum PaymentErrorCode {
	UNAUTHORIZED = "UNAUTHORIZED",
	NOT_FOUND = "NOT_FOUND",
	FORBIDDEN = "FORBIDDEN",
	CONFLICT = "CONFLICT",
	BAD_REQUEST = "BAD_REQUEST",
}

const PAYMENT_ERROR_STATUS: Record<PaymentErrorCode, number> = {
	[PaymentErrorCode.UNAUTHORIZED]: 401,
	[PaymentErrorCode.NOT_FOUND]: 404,
	[PaymentErrorCode.FORBIDDEN]: 403,
	[PaymentErrorCode.CONFLICT]: 409,
	[PaymentErrorCode.BAD_REQUEST]: 400,
};

export class PaymentError extends AppError {
	readonly code: PaymentErrorCode;

	constructor(code: PaymentErrorCode, message?: string, options?: { cause?: unknown }) {
		super(message ?? PaymentError.defaultMessage(code), PAYMENT_ERROR_STATUS[code], options);
		this.code = code;
	}

	private static defaultMessage(code: PaymentErrorCode): string {
		switch (code) {
			case PaymentErrorCode.UNAUTHORIZED:
				return "Unauthorized";
			case PaymentErrorCode.NOT_FOUND:
				return "Payment not found";
			case PaymentErrorCode.FORBIDDEN:
				return "Access to this payment is forbidden";
			case PaymentErrorCode.CONFLICT:
				return "Payment already exists";
			case PaymentErrorCode.BAD_REQUEST:
				return "Invalid payment request";
			default:
				return "Payment error";
		}
	}
}
