import type { NextFunction, Request, Response } from "express";
import type { BillingCycle } from "../../generated/enums";
import { days, type daysEnumType } from "../types/member.types";
import { appLogger } from "./logger";

/**
 * Typed version for better TypeScript support
 */
export function catchAsync<T extends Request, U extends Response, V extends NextFunction>(
	fn: (req: T, res: U, next: V) => Promise<any>,
): (req: T, res: U, next: V) => void {
	return (req: T, res: U, next: V) => {
		Promise.resolve(fn(req, res, next)).catch((error) => {
			const logger = appLogger.withRequest(req);
			logger.error("Async error caught", {
				error: error.message,
				stack: error.stack,
				path: req.path,
				method: req.method,
			});
			next(error);
		});
	};
}

export function computeMembershipEndDate(start: Date, days: number): Date {
	const end = new Date(start);
	end.setDate(end.getDate() + days);
	return end;
}

export function computePeriodEnd(start: Date, billingCycle: BillingCycle): Date {
	const end = new Date(start);
	switch (billingCycle) {
		case "TRIAL":
			end.setDate(end.getDate() + 7);
			break;
		case "MONTHLY":
			end.setMonth(end.getMonth() + 1);
			break;
		case "QUARTERLY":
			end.setMonth(end.getMonth() + 3);
			break;
		case "HALF_YEARLY":
			end.setMonth(end.getMonth() + 6);
			break;
		case "YEARLY":
			end.setFullYear(end.getFullYear() + 1);
			break;
	}
	return end;
}

export function computeAge(dateOfBirth: Date): number {
	const today = new Date();
	let age = today.getFullYear() - dateOfBirth.getFullYear();
	const m = today.getMonth() - dateOfBirth.getMonth();
	if (m < 0 || (m === 0 && today.getDate() < dateOfBirth.getDate())) {
		age--;
	}
	return age;
}
export const ALLOWED_MIMETYPES: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

// midnight of `date`'s calendar day in the runtime's local timezone, normalized to a UTC instant
export function toLocalMidnight(date: Date): Date {
	const parts = new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const year = parts.find((p) => p.type === "year")!.value;
	const month = parts.find((p) => p.type === "month")!.value;
	const day = parts.find((p) => p.type === "day")!.value;

	return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

export function getWeekStart(date: Date): Date {
	const d = new Date(Date.UTC(date.getFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const dow = d.getUTCDay(); // 0 = Sun ... 6 = Sat
	const diffToMonday = dow === 0 ? -6 : 1 - dow;
	d.setUTCDate(d.getUTCDate() + diffToMonday);
	d.setUTCHours(0, 0, 0, 0);
	return d;
}

export function getDayName(date: Date): daysEnumType {
	return days[toLocalMidnight(date).getUTCDay()] as daysEnumType;
}

/**
 * Decides whether a check-in at `referenceDate` starts a new streak day, given the
 * member's current streak/last-check-in. Shared between real-time check-ins and
 * bulk attendance sync so both paths only count one "visit" per calendar day.
 */
export function computeStreakUpdate(
	currentStreak: number,
	lastCheckIn: Date | null,
	referenceDate: Date,
): { newStreak: number; alreadyCheckedInToday: boolean } {
	const today = toLocalMidnight(referenceDate);

	if (!lastCheckIn) {
		return { newStreak: 1, alreadyCheckedInToday: false };
	}

	const last = toLocalMidnight(lastCheckIn);
	const diff = Math.floor((today.getTime() - last.getTime()) / 86_400_000);

	if (diff === 0) {
		return { newStreak: currentStreak, alreadyCheckedInToday: true };
	}
	if (diff === 1) {
		return { newStreak: currentStreak + 1, alreadyCheckedInToday: false };
	}
	return { newStreak: 1, alreadyCheckedInToday: false };
}
