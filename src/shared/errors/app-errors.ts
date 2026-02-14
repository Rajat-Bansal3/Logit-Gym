export class AppError extends Error {
	readonly statusCode: number;
	readonly isOperational = true;

	constructor(message: string, statusCode: number, options?: { cause?: unknown }) {
		super(message, options);
		this.statusCode = statusCode;

		Object.setPrototypeOf(this, new.target.prototype);
		Error.captureStackTrace(this);
	}
}
