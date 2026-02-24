import type { NextFunction, Request, Response } from "express";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import { createGymSchema, updateGymSchema } from "../../shared/types/gym.types";
import { AppLogger } from "../../shared/utils/logger";
import { GymService } from "../services/gym.service";

export class GymController {
	private gymService: GymService;
	private logger: AppLogger;

	constructor() {
		this.gymService = new GymService();
		this.logger = new AppLogger();
	}

	async createGym(req: Request, res: Response, next: NextFunction) {
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
	}

	async getGym(req: Request, res: Response, next: NextFunction) {
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
	}

	async updateGym(req: Request, res: Response, next: NextFunction) {
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
	}

	async deleteGym(req: Request, res: Response, next: NextFunction) {
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
	}
}
