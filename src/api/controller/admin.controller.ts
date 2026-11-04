import type { Request, Response } from "express";
import { z } from "zod";
import { AuthError, AuthErrorCode } from "../../shared/errors/auth-errors";
import {
	AdminService,
	adminPlanInputSchema,
	extendTrialInputSchema,
	gymStatusInputSchema,
	refundInputSchema,
} from "../services/admin.service";

const planStatusSchema = z.object({ isActive: z.boolean() });
const service = new AdminService();

export class AdminController {
	getOverview = async (_req: Request, res: Response) => res.json(await service.getOverview());
	getGyms = async (_req: Request, res: Response) => res.json(await service.getGyms());
	getPlans = async (_req: Request, res: Response) => res.json(await service.getPlans());
	getBilling = async (_req: Request, res: Response) => res.json(await service.getBilling());
	createPlan = async (req: Request, res: Response) => {
		res.status(201).json(await service.createPlan(adminPlanInputSchema.parse(req.body)));
	};
	setPlanActive = async (req: Request, res: Response) => {
		const { isActive } = planStatusSchema.parse(req.body);
		res.json(await service.setPlanActive(String(req.params.planId), isActive));
	};
	setGymStatus = async (req: Request, res: Response) => {
		const { suspended } = gymStatusInputSchema.parse(req.body);
		res.json(await service.setGymSuspended(String(req.params.gymId), suspended));
	};
	extendTrial = async (req: Request, res: Response) => {
		const { days } = extendTrialInputSchema.parse(req.body);
		res.json(await service.extendTrial(String(req.params.gymId), days));
	};
	requestRefund = async (req: Request, res: Response) => {
		const input = refundInputSchema.parse(req.body);
		if (!req.user) {
			throw new AuthError(AuthErrorCode.UNAUTHORIZED);
		}
		res.status(201).json(await service.requestRefund(input.invoiceId, input.reason, req.user.id));
	};
}
