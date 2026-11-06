import type { Request, Response } from "express";
import { z } from "zod";
import { WhatsAppTemplateCategory } from "../../generated/enums";
import { WhatsAppService } from "../services/whatsapp.service";

const service = new WhatsAppService();
const settingsSchema = z.object({
	pricePerMessagePaise: z.number().int().positive().nullable(),
	lowBalanceThresholdPaise: z.number().int().nonnegative(),
});
const templateSchema = z.object({
	category: z.nativeEnum(WhatsAppTemplateCategory),
	externalTemplateKey: z.string().trim().min(1).max(200),
	name: z.string().trim().min(1).max(100),
	language: z.string().trim().min(2).max(20),
	previewText: z.string().trim().min(1).max(1000),
	variableNames: z.array(z.string().trim().min(1).max(50)).max(20),
	providerApproved: z.boolean(),
	isVisible: z.boolean(),
});
const creditSchema = z.object({
	amountPaise: z.number().int().positive(),
	note: z.string().trim().min(2).max(300),
});

export class WhatsAppAdminController {
	getData = async (_req: Request, res: Response) => {
		res.json({ success: true, data: await service.getAdminData() });
	};

	setSettings = async (req: Request, res: Response) => {
		const input = settingsSchema.parse(req.body);
		res.json({
			success: true,
			data: await service.setAdminSettings(
				input.pricePerMessagePaise,
				input.lowBalanceThresholdPaise,
			),
		});
	};

	createTemplate = async (req: Request, res: Response) => {
		const input = templateSchema.parse(req.body);
		res.status(201).json({ success: true, data: await service.saveTemplate(input) });
	};

	updateTemplate = async (req: Request, res: Response) => {
		const input = templateSchema.parse(req.body);
		res.json({
			success: true,
			data: await service.saveTemplate({ ...input, id: String(req.params.templateId) }),
		});
	};

	creditWallet = async (req: Request, res: Response) => {
		const gymId = String(req.params.gymId);
		const input = creditSchema.parse(req.body);
		res.status(201).json({
			success: true,
			data: await service.creditWallet(gymId, input.amountPaise, input.note),
		});
	};
}

export const whatsAppAdminController = new WhatsAppAdminController();
