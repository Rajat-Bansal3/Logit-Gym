import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import type { AuthenticatedUser } from "../../shared/types/auth.types";
import type { CreateGym, UpdateGym } from "../../shared/types/gym.types";
import type { BaseResponse } from "../../shared/types/returns";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import { GymRepository } from "../repositories/gym.repository";

export class GymService {
	private gymRepository: GymRepository;
	private logger: AppLogger;

	constructor() {
		this.gymRepository = new GymRepository(client);
		this.logger = new AppLogger();
	}

	async createGym(
		data: CreateGym,
		user: AuthenticatedUser,
	): Promise<BaseResponse<{ gymId: string }>> {
		this.logger.debug("createGym: checking existing gym for owner", {
			userId: user.id,
		});

		const gym = await this.gymRepository.create({
			name: data.name,
			address: data.address,
			ownerId: user.id,
		});

		if (data.profile) {
			await this.gymRepository.createProfile(gym.id, data.profile);
		}

		this.logger.debug("createGym: success", { gymId: gym.id });
		return {
			message: "Gym created successfully",
			success: true,
			data: { gymId: gym.id },
		};
	}

	async getGym(gymId: string, user: AuthenticatedUser): Promise<BaseResponse<any>> {
		this.logger.debug("getGym: fetching gym", { gymId });

		const gym = await this.gymRepository.findByIdWithProfile({
			gymId: gymId,
			isDeleted: false,
		});
		if (!gym) {
			throw new GymError(GymErrorCode.NOT_FOUND, "Gym not found");
		}

		const canAccess = await this.canAccessGym(gym, user, "read");
		if (!canAccess) {
			throw new GymError(GymErrorCode.FORBIDDEN, "You do not have permission to view this gym");
		}

		let responseData = gym;
		if (gym.ownerId !== user.id) {
			responseData = this.filterSensitiveGymData(gym);
		}

		return {
			message: "Gym fetched successfully",
			success: true,
			data: responseData,
		};
	}

	async updateGym(
		gymId: string,
		updates: UpdateGym,
		user: AuthenticatedUser,
	): Promise<BaseResponse<any>> {
		this.logger.debug("updateGym: updating gym", { gymId });

		const gym = await this.gymRepository.findById({ gymId, isDeleted: false });
		if (!gym) {
			throw new GymError(GymErrorCode.NOT_FOUND, "Gym not found");
		}

		if (gym.ownerId !== user.id) {
			throw new GymError(GymErrorCode.FORBIDDEN, "Only the gym owner can update");
		}

		if (updates.name !== undefined || updates.address !== undefined) {
			await this.gymRepository.update(gymId, {
				...(updates.name !== undefined && { name: updates.name }),
				...(updates.address !== undefined && { address: updates.address }),
			});
		}

		if (updates.profile) {
			await this.gymRepository.upsertProfile(gymId, updates.profile);
		}

		const updatedGym = await this.gymRepository.findByIdWithProfile({
			gymId,
			isDeleted: false,
		});
		if (!updatedGym) {
			throw new GymError(GymErrorCode.NOT_FOUND, "Gym not found after update");
		}

		return {
			message: "Gym updated successfully",
			success: true,
			data: updatedGym,
		};
	}

	async deleteGym(gymId: string, user: AuthenticatedUser): Promise<BaseResponse<null>> {
		this.logger.debug("deleteGym: deleting gym", { gymId });

		const gym = await this.gymRepository.findById({ gymId, isDeleted: false });
		if (!gym) {
			throw new GymError(GymErrorCode.NOT_FOUND, "Gym not found");
		}

		if (gym.ownerId !== user.id) {
			throw new GymError(GymErrorCode.FORBIDDEN, "Only the gym owner can delete");
		}

		await this.gymRepository.delete(gymId);

		return {
			message: "Gym deleted successfully",
			success: true,
			data: null,
		};
	}

	private async canAccessGym(
		gym: any,
		user: AuthenticatedUser,
		accessType: "read" | "write",
	): Promise<boolean> {
		if (gym.ownerId === user.id) {
			return true;
		}
		if (accessType === "read") {
			if (user.role === "TRAINER" || user.role === "MEMBER") {
				const member = await this.gymRepository.findMemberByUserId(user.id);
				return member?.gymId === gym.id;
			}
		}
		return false;
	}

	private filterSensitiveGymData(gym: any): any {
		const { ownerId, profile, ...rest } = gym;
		if (profile) {
			const { ownerName, ownerContact, ...filteredProfile } = profile;
			return { ...rest, profile: filteredProfile };
		}
		return rest;
	}
}
