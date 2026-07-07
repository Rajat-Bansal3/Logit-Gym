import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../../env";
import { AppError } from "../../shared/errors/app-errors";
import { client } from "../../shared/utils/prisma";
import { GymService } from "../services/gym.service";

export class WebhookController {
	private gymService: GymService;
	constructor() {
		this.gymService = new GymService({ prisma: client });
	}

	handleRazorpay = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const signature = req.headers["x-razorpay-signature"] as string;
			const isValid = this.verifyRazorpayWebhook(req.body, signature);
			if (!isValid) {
				throw new AppError("Invalid webhook signature", 400);
			}

			const event = JSON.parse(req.body.toString());
			await this.gymService.handleRazorpayWebhook(event);

			return res.status(200).json({ received: true });
		} catch (error) {
			next(error);
			return;
		}
	};
	private verifyRazorpayWebhook(body: Buffer, signature: string): boolean {
		const expected = crypto
			.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
			.update(body)
			.digest("hex");
		return expected === signature;
	}
}
