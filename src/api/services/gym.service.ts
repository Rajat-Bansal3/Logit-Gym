import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { env } from "../../env";
import type { CheckInType, Plan, PrismaClient } from "../../generated/client";
import { AppError } from "../../shared/errors/app-errors";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import type { AuthenticatedUser } from "../../shared/types/auth.types";
import type {
	AddMachine,
	CreateGym,
	CreatePlanInput,
	CreateSubscription,
	SyncData,
	UpdateGym,
} from "../../shared/types/gym.types";
import type { BaseResponse } from "../../shared/types/returns";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import {
	createRZPPlan,
	createRZPSubscription,
	deleteRZPSubscription,
} from "../../shared/utils/rzp";
import { s3 } from "../../shared/utils/s3";
import { ALLOWED_MIMETYPES } from "../../shared/utils/util_functions";
import { BulkRepository, type createManyAttendanceType } from "../repositories/bulk.repository";
import { GymRepository, type gym_with_profile } from "../repositories/gym.repository";
import { MachineRepository } from "../repositories/machine.repository";
import { MemberRepository } from "../repositories/member.repository";
import { type gym_with_sub, PlanRepository } from "../repositories/plan.repository";

export class GymService {
	private gymRepository: GymRepository;
	private logger: AppLogger;
	private machineRepository: MachineRepository;
	private planRepository: PlanRepository;
	private bulkRepository: BulkRepository;
	private memberRepository: MemberRepository;

	constructor({ prisma = client }: { prisma: PrismaClient }) {
		this.gymRepository = new GymRepository(prisma);
		this.logger = new AppLogger();
		this.machineRepository = new MachineRepository(prisma);
		this.planRepository = new PlanRepository(prisma);
		this.bulkRepository = new BulkRepository(prisma);
		this.memberRepository = new MemberRepository(prisma);
	}

	async createGym(
		data: CreateGym,
		user: AuthenticatedUser,
		images?: Express.Multer.File[],
	): Promise<BaseResponse<{ gymId: string }>> {
		this.logger.debug("createGym: checking existing gym for owner", {
			userId: user.id,
		});

		const gym = await this.gymRepository.create({
			name: data.name,
			address: data.address,
			ownerId: user.id,
			bioPref: data.settings.biometricCodePreference,
			startingMembershipCode: data.startingMembershipCode,
		});
		if (data.profile) {
			const imagePaths = images ? images.map((img) => img.path) : [];
			await this.gymRepository.createProfile(gym.id, data.profile, imagePaths);
		}

		this.logger.debug("createGym: success", { gymId: gym.id });
		return {
			message: "Gym created successfully",
			success: true,
			data: { gymId: gym.id },
		};
	}

	async getGymUser(user: AuthenticatedUser): Promise<string> {
		const gym = await this.gymRepository.findByUser({
			ownerId: user.id,
			isDeleted: false,
		});
		if (!gym) {
			throw new GymError(GymErrorCode.NOT_FOUND, "Gym not found");
		}
		return gym.id;
	}

	async getGym(gymId: string, user: AuthenticatedUser): Promise<BaseResponse<gym_with_profile>> {
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
		images?: Express.Multer.File[],
	): Promise<BaseResponse<any>> {
		this.logger.debug("updateGym: updating gym", {
			gymId,
		});

		const gym = await this.gymRepository.findById({
			gymId,
			isDeleted: false,
		});

		if (!gym) {
			throw new GymError(GymErrorCode.NOT_FOUND, "Gym not found");
		}

		if (gym.ownerId !== user.id) {
			throw new GymError(GymErrorCode.FORBIDDEN, "Only the gym owner can update");
		}

		if (updates.name !== undefined || updates.address !== undefined) {
			await this.gymRepository.update(gymId, {
				...(updates.name !== undefined && {
					name: updates.name,
				}),

				...(updates.address !== undefined && {
					address: updates.address,
				}),
			});
		}

		if (updates.profile) {
			const retainedImages = updates.profile.images ?? [];

			const newImagePaths = images?.map((file) => file.path) ?? [];

			const finalImages = [...retainedImages, ...newImagePaths];

			this.logger.debug("updateGym: image update", {
				retainedImages,
				newImagePaths,
				finalImages,
			});

			await this.gymRepository.upsertProfile(gymId, updates.profile, finalImages);
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

	async addMachine(data: AddMachine, gymId: string): Promise<BaseResponse<null>> {
		const resp = await this.machineRepository.addMachine({
			apiKey: env.MACHINE_SERVER_API_KEY,
			gymId: gymId,
			machinename: data.machineName,
			serialNumber: data.serialNumber,
		});
		return {
			message: resp,
			success: true,
		};
	}
	async removeMachine(data: AddMachine): Promise<BaseResponse<null>> {
		const resp = await this.machineRepository.removeMachine({
			apiKey: env.MACHINE_SERVER_API_KEY,
			serialNumber: data.serialNumber,
		});
		return {
			message: resp,
			success: true,
		};
	}
	generatePresignedUrl = async ({
		code,
		mimetype,
	}: {
		code: string;
		mimetype: string;
	}): Promise<{ presignedUrl: string; key: string }> => {
		const ext = ALLOWED_MIMETYPES[mimetype];
		if (!ext) {
			throw new AppError("Invalid file type", 400);
		}

		const key = `${code}/avatar/${uuidv4()}.${ext}`;

		const presignedUrl = await getSignedUrl(
			s3,
			new PutObjectCommand({
				Bucket: env.AWS_S3_BUCKET,
				Key: key,
				ContentType: mimetype,
			}),
			{ expiresIn: 60 * 15 },
		);

		return { presignedUrl, key };
	};
	getPlans = async (): Promise<BaseResponse<Plan[]>> => {
		const plans = await this.planRepository.getPlans();
		return {
			message: "plans fetched successfully",
			success: true,
			data: plans,
		};
	};
	getSub = async (gymId: string): Promise<BaseResponse<gym_with_sub>> => {
		const currentSubscription = await this.planRepository.getSubscription(gymId);
		return {
			message: "subs fetched successfully",
			success: true,
			data: currentSubscription,
		};
	};
	createGymSubscription = async (data: CreateSubscription, gymId: string) => {
		const plan = await this.planRepository.getPlan(data.planId);
		if (plan === null || plan === undefined) {
			throw new GymError(GymErrorCode.NOT_FOUND, "plan with planId not found");
		}
		const existingSub = await this.planRepository.findActiveSubscription(gymId);
		if (existingSub) {
			throw new GymError(GymErrorCode.CONFLICT, "Gym already has an active subscription");
		}
		if (plan.billingCycle === "TRIAL") {
			await this.planRepository.createSub(gymId, plan.id, "trial_sub", plan);

			return {
				message: "successfully created subscription",
				data: "trial",
				success: true,
			};
		}
		const subscription = await createRZPSubscription(plan.razorpayId, gymId);
		try {
			await this.planRepository.createSub(gymId, plan.id, subscription.id, plan);
		} catch (error) {
			await deleteRZPSubscription(subscription.id);
			return {
				message: "no subscription created, cancelled",
				data: error,
				success: false,
			};
		}
		return {
			message: "successfully created subscription",
			data: subscription.short_url,
			success: true,
		};
	};
	handleRazorpayWebhook = async (event: any): Promise<void> => {
		const { event: eventType, payload } = event;

		switch (eventType) {
			case "subscription.activated":
				await this.handleSubscriptionActivated(payload.subscription.entity);
				break;
			case "subscription.charged":
				await this.handleSubscriptionCharged(payload.subscription.entity, payload.payment.entity);
				break;
			case "subscription.halted":
				await this.handleSubscriptionHalted(payload.subscription.entity);
				break;
			case "subscription.cancelled":
				await this.handleSubscriptionCancelled(payload.subscription.entity);
				break;
			case "subscription.pending":
				await this.handleSubscriptionPending(payload.subscription.entity);
				break;
		}
	};
	syncAttendance = async (syncData: SyncData, gymId: string): Promise<BaseResponse<number>> => {
		const logs = await this.machineRepository.getDeviceLogs(
			syncData.serialNumber,
			env.MACHINE_SERVER_API_KEY,
			syncData.date,
		);
		const members = await this.memberRepository.getMembers(
			logs.map((log) => log.memberCode),
			gymId,
		);
		const memberMap = new Map(members.map((member) => [member.membershipCode, member.id]));

		const data: createManyAttendanceType = logs
			.map((log) => {
				const memberId = memberMap.get(log.memberCode);
				if (!memberId) {
					return null;
				}
				return {
					memberId: memberId,
					membershipCode: log.memberCode,
					timestamp: this.utcDate(log.logDate),
					gymId: gymId,
					type: "IN" as CheckInType,
				};
			})
			.filter((item): item is NonNullable<typeof item> => item !== null);
		if (data.length < 1) {
			return {
				message: "failed",
				success: false,
				data: 0,
			};
		}
		await this.bulkRepository.syncAttenceWithLogs(data);
		return {
			message: "successfully synced",
			success: true,
			data: data.length,
		};
	};
	createPlan = async (
		planData: CreatePlanInput,
	): Promise<BaseResponse<{ name: string; active: boolean }>> => {
		if (planData.apiKey !== env.PLANS_API_KEY) {
			return {
				message: "auth failed",
				success: false,
			};
		}
		const rzp_planID = await createRZPPlan({
			amount: planData.planAmount,
			billingCycle: planData.billing_cycle,
			interval: planData.interval,
			name: planData.plan_name,
		});
		const repoPlan = await this.gymRepository.createPlan({
			...planData,
			rzp_planID,
		});
		return {
			message: "plan created successfully",
			success: true,
			data: { name: repoPlan.name, active: repoPlan.isActive },
		};
	};
	private utcDate(deviceTime: string) {
		return new Date(new Date(`${deviceTime.replace(" ", "T")}+05:30`).toISOString());
	}

	private handleSubscriptionActivated = async (subscription: any): Promise<void> => {
		const gymId = subscription.notes.gymId;

		await this.planRepository.updateSubscription(subscription.id, gymId, {
			status: "ACTIVE",
			currentPeriodStart: new Date(subscription.current_start * 1000),
			currentPeriodEnd: new Date(subscription.current_end * 1000),
			gracePeriodEnd: null,
		});
	};

	private handleSubscriptionCharged = async (subscription: any, payment: any): Promise<void> => {
		// idempotency guard
		const existing = await this.planRepository.findInvoiceByGatewayId(payment.id);
		if (existing) {
			return;
		}

		await this.planRepository.createInvoiceAndActivate({
			gatewaySubscriptionId: subscription.id,
			gymId: subscription.notes.gymId,
			amount: payment.amount / 100,
			paidDate: new Date(payment.created_at * 1000),
			gatewayInvoiceId: payment.id,
			currentPeriodStart: new Date(subscription.current_start * 1000),
			currentPeriodEnd: new Date(subscription.current_end * 1000),
		});
	};

	private handleSubscriptionHalted = async (subscription: any): Promise<void> => {
		await this.planRepository.updateSubscription(subscription.id, subscription.notes.gymId, {
			status: "EXPIRED",
			gracePeriodEnd: new Date(Date.now() + 5 * 86_400_000),
		});
	};

	private handleSubscriptionCancelled = async (subscription: any): Promise<void> => {
		await this.planRepository.updateSubscription(subscription.id, subscription.notes.gymId, {
			status: "CANCELLED",
		});
	};

	private handleSubscriptionPending = async (subscription: any): Promise<void> => {
		await this.planRepository.updateSubscription(subscription.id, subscription.notes.gymId, {
			status: "EXPIRED",
		});
	};

	//private methods
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
