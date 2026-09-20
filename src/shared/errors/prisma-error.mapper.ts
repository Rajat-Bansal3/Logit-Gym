import { Prisma } from "../../generated/client";
import { AppError } from "./app-errors";

/**
 * Friendly, user-actionable text for unique fields that can collide.
 * Falls back to a generic "already in use" message for anything unlisted,
 * so we never need to guess at unmapped columns.
 */
const UNIQUE_FIELD_MESSAGES: Record<string, string> = {
	username: "This username is already taken. Please choose a different one.",
	email: "This email address is already registered.",
	phone: "A member with this phone number already exists.",
	serialNumber: "A machine with this serial number is already registered.",
	membershipCode: "This membership code is already in use. Please choose another one.",
	hash: "Could not generate a unique gym link. Please try again.",
};

function friendlyUniqueMessage(target: unknown): string {
	const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];

	for (const field of fields) {
		const message = UNIQUE_FIELD_MESSAGES[field];
		if (message) return message;
	}

	return "This value is already in use. Please try a different one.";
}

/**
 * Translates known Prisma errors into safe, user-facing AppErrors.
 * Returns null when the error isn't a recognized Prisma error, so callers
 * can fall back to their own generic "unexpected error" handling.
 */
export function mapPrismaError(error: unknown): AppError | null {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		switch (error.code) {
			case "P2002":
				return new AppError(friendlyUniqueMessage(error.meta?.target), 409);
			case "P2025":
				return new AppError("The requested record could not be found. It may have already been removed.", 404);
			case "P2003":
				return new AppError("This action can't be completed because it references data that no longer exists.", 409);
			case "P2014":
				return new AppError("This action would break a required relationship between records.", 409);
			default:
				return new AppError("We couldn't process that request. Please try again.", 400);
		}
	}

	if (error instanceof Prisma.PrismaClientValidationError) {
		return new AppError("Some of the submitted data is invalid. Please check your input and try again.", 400);
	}

	return null;
}
