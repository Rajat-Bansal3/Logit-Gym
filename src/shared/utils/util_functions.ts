import type { NextFunction, Request, Response } from "express";
import { MembershipPlanType } from "../../generated/enums";
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

export function computeMembershipEndDate(start: Date, planType: MembershipPlanType): Date {
	const end = new Date(start);
	const monthsMap: Record<MembershipPlanType, number> = {
		[MembershipPlanType.MONTHLY]: 1,
		[MembershipPlanType.QUARTERLY]: 3,
		[MembershipPlanType.HALF_YEARLY]: 6,
		[MembershipPlanType.YEARLY]: 12,
	};
	end.setMonth(end.getMonth() + monthsMap[planType]);
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
