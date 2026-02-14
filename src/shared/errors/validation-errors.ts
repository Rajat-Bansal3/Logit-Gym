import type { ZodError } from "zod";
import { AppError } from "./app-errors";

export type FieldError = {
	field: string;
	message: string;
};

export class ValidationError extends AppError {
	readonly code = "VALIDATION_ERROR";
	readonly errors: FieldError[];
	constructor(zodError: ZodError, message: string = "Validation failed") {
		super(message, 422);
		this.errors = zodError.errors.map((issue) => ({
			field: issue.path.join("."),
			message: issue.message,
		}));
	}
}
