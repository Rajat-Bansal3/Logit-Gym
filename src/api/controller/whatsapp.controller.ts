import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-errors";
import { WhatsAppService } from "../services/whatsapp.service";

const service = new WhatsAppService();
const settingsSchema = z.object({ enabled: z.boolean() });
const consentSchema = z.object({
	utilityOptIn: z.boolean(),
	marketingOptIn: z.boolean(),
});
const sendSchema = z.object({
	memberId: z.string().min(1),
	templateId: z.string().min(1),
});
const pageSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

function ownerContext(req: Request) {
	if (req.user?.role !== "OWNER") {
		throw new AppError("Owner authentication required", 401);
	}
	const gymId = String(req.params.gymId);
	return { gymId, ownerId: req.user.id };
}

export class WhatsAppController {
	getOverview = async (req: Request, res: Response) => {
		const { gymId, ownerId } = ownerContext(req);
		res.json({ success: true, data: await service.getOverview(gymId, ownerId) });
	};

	getMembers = async (req: Request, res: Response) => {
		const { gymId, ownerId } = ownerContext(req);
		const { page, limit } = pageSchema.parse(req.query);
		res.json({
			success: true,
			data: await service.listMembers(gymId, ownerId, page, limit),
		});
	};

	setEnabled = async (req: Request, res: Response) => {
		const { gymId, ownerId } = ownerContext(req);
		const input = settingsSchema.parse(req.body);
		res.json({ success: true, data: await service.setEnabled(gymId, ownerId, input.enabled) });
	};

	setConsent = async (req: Request, res: Response) => {
		const { gymId, ownerId } = ownerContext(req);
		const input = consentSchema.parse(req.body);
		res.json({
			success: true,
			data: await service.setConsent(gymId, ownerId, String(req.params.memberId), input),
		});
	};

	sendMessage = async (req: Request, res: Response) => {
		const { gymId, ownerId } = ownerContext(req);
		const input = sendSchema.parse(req.body);
		const key =
			req.header("Idempotency-Key") || `${input.memberId}:${input.templateId}:${Date.now()}`;
		res.status(201).json({
			success: true,
			data: await service.sendMessage(gymId, ownerId, input.memberId, input.templateId, key),
		});
	};

	getHistory = async (req: Request, res: Response) => {
		const { gymId, ownerId } = ownerContext(req);
		const { page, limit } = pageSchema.parse(req.query);
		res.json({
			success: true,
			data: await service.listHistory(gymId, ownerId, page, limit),
		});
	};
}

export const whatsAppController = new WhatsAppController();
