import type { NextFunction, Request, Response } from "express";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import {
	addMachineSchema,
	createGymSchema,
	createSubscriptionSchema,
	getPresignedUrlsSchema,
	syncDataSchema,
	updateGymSchema,
} from "../../shared/types/gym.types";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import { createRZPPlan } from "../../shared/utils/rzp";
import { GymService } from "../services/gym.service";

export class GymController {
	private gymService: GymService;
	private logger: AppLogger;

	constructor() {
		this.gymService = new GymService({ prisma: client });
		this.logger = new AppLogger();
	}

	createGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("createGym: request received");
			const user = req.user;
			if (!user) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const data = createGymSchema.parse(req.body);
			const result = await this.gymService.createGym(data, user);
			this.logger.debug("createGym: completed", {
				userId: user.id,
			});
			res.status(201).json(result);
		} catch (error) {
			this.logger.error("createGym: error", { error });
			next(error);
		}
	};

	getGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getGym: request received", { gymId: req.params.id });
			const user = req.user;
			const gymId = req.params.id;
			if (!user || !gymId || Array.isArray(gymId)) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const result = await this.gymService.getGym(gymId, user);
			this.logger.debug("getGym: completed", { gymId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("getGym: error", { gymId: req.params.id, error });
			next(error);
		}
	};

	updateGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("updateGym: request received", {
				gymId: req.params.id,
			});
			const user = req.user;
			const gymId = req.params.id;
			if (!user || !gymId || Array.isArray(gymId)) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const updates = updateGymSchema.parse(req.body);
			const result = await this.gymService.updateGym(gymId, updates, user);
			this.logger.debug("updateGym: completed", { gymId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("updateGym: error", { gymId: req.params.id, error });
			next(error);
		}
	};

	deleteGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("deleteGym: request received", {
				gymId: req.params.id,
			});
			const user = req.user;
			const gymId = req.params.id;
			if (!user || !gymId || Array.isArray(gymId)) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			await this.gymService.deleteGym(gymId, user);
			this.logger.debug("deleteGym: completed", { gymId });
			res.status(204).json({});
		} catch (error) {
			this.logger.error("deleteGym: error", { gymId: req.params.id, error });
			next(error);
		}
	};
	addMachine = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const data = addMachineSchema.parse(req.body);
			const resp = await this.gymService.addMachine(data, user.gymId);
			return res.status(200).json(resp);
		} catch (error) {
			this.logger.error("add machine: error", {
				gymId: req.user?.gymId,
				error,
			});
			next(error);
			return;
		}
	};
	removeMachine = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const data = addMachineSchema.parse(req.body);
			const resp = await this.gymService.removeMachine(data);
			return res.status(200).json(resp);
		} catch (error) {
			this.logger.error("remove machine: error", {
				gymId: req.user?.gymId,
				error,
			});
			next(error);
			return;
		}
	};
	getPresignedUrls = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = getPresignedUrlsSchema.parse(req.body);
			const pre_urls = await this.gymService.generatePresignedUrl({
				code: data.id,
				mimetype: data.mimeType,
			});
			return res.status(200).json(pre_urls);
		} catch (err) {
			next(err);
			return;
		}
	};

	getPlans = async (_req: Request, res: Response, next: NextFunction) => {
		try {
			const plans = await this.gymService.getPlans();
			return res.status(200).json(plans);
		} catch (error) {
			next(error);
			return;
		}
	};
	createPlan = async (_req: Request, res: Response, _next: NextFunction) => {
		const plan = await createRZPPlan({
			amount: 1000,
			billingCycle: "MONTHLY",
			name: "basic",
		});
		await client.plan.create({
			data: {
				billingCycle: "MONTHLY",
				name: "basic",
				price: 1000,
				razorpayId: plan,
			},
		});
		res.status(200).json({});
	};
	getSub = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "gym id not found");
			}
			const plans = await this.gymService.getSub(user.gymId);
			return res.status(200).json(plans);
		} catch (error) {
			next(error);
			return;
		}
	};

	createSubscription = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = createSubscriptionSchema.parse(req.body);
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "gym id not found");
			}
			const subscription = await this.gymService.createGymSubscription(data, user.gymId);
			return res.status(200).json(subscription);
		} catch (error) {
			next(error);
			return;
		}
	};
	syncAttendance = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = syncDataSchema.parse(req.body);
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "gym id not found");
			}
			const ok = await this.gymService.syncAttendance(data, user.gymId);
			res.status(200).json(ok);
		} catch (error) {
			next(error);
		}
	};
}
