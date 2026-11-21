import type { Request, Response } from "express";
import { AppError } from "../../shared/errors/app-errors";
import { ReferralService } from "../services/referral.service";

const service = new ReferralService();

export class ReferralController {
	getOwnerOverview = async (req: Request, res: Response) => {
		if (!req.user?.id) {
			throw new AppError("Authentication is required.", 401);
		}
		const data = await service.getOwnerOverview(req.user.id);
		res.status(200).json({ success: true, data });
	};
}
