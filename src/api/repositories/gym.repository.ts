import type { Gym, Prisma, PrismaClient } from "../../generated/client";
import type { BioPref } from "../../generated/enums";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import type { CreateGym, CreatePlanRepoInput, UpdateGym } from "../../shared/types/gym.types";
import { computePeriodEnd } from "../../shared/utils/util_functions";

type gym_including_owner = Prisma.GymGetPayload<{
	include: {
		owner: true;
	};
}>;

export type gym_with_profile = Prisma.GymGetPayload<{
	include: {
		gymProfile: true;
		machines: true;
		_count: {
			select: {
				members: true;
			};
		};
	};
}>;

export class GymRepository {
	private client: PrismaClient;
	constructor(client: PrismaClient) {
		this.client = client;
	}
	findByOwnerId = async (ownerId: string): Promise<gym_including_owner[]> => {
		return await this.client.gym.findMany({
			where: {
				ownerId: ownerId,
			},
			include: {
				owner: true,
			},
		});
	};
	create = async (data: {
		name: string;
		address: string;
		ownerId: string;
		bioPref: BioPref;
		startingMembershipCode: number | undefined;
	}): Promise<Gym> => {
		const gym = this.client.$transaction(async (tx) => {
			const settings = await tx.settings.create({
				data: {
					biometricPreference: data.bioPref,
				},
			});
			const gym = await tx.gym.create({
				data: {
					name: data.name,
					address: data.address,
					ownerId: data.ownerId,
					hash: `${data.name}-${crypto.randomUUID()}`,
					settingsId: settings.id,
					...(data.startingMembershipCode && {
						startingMembershipCode: data.startingMembershipCode,
					}),
				},
			});
			const plan = await tx.plan.findFirst({
				where: { isActive: true, name: "TRIAL" },
			});
			if (!plan) {
				throw new GymError(GymErrorCode.NOT_FOUND, "no active triall found");
			}

			const curr = computePeriodEnd(new Date(), plan.billingCycle);

			const sub = await tx.subscription.create({
				data: {
					gymId: gym.id,
					planId: plan.id,
					status: "TRIALING",
					currentPeriodStart: new Date(),
					currentPeriodEnd: curr,
					trialEndsAt: curr,
					cancelAtPeriodEnd: false,
				},
			});

			await tx.gym.update({
				where: { id: gym.id },
				data: { currentSubscriptionId: sub.id },
			});
			await tx.gymMetrics.create({
				data: {
					gymId: gym.id,
				},
			});
			return gym;
		});
		return gym;
	};
	createProfile = async (
		gymId: string,
		profile: NonNullable<CreateGym["profile"]>,
		imagePaths: string[],
	): Promise<void> => {
		await this.client.gymProfile.create({
			data: {
				gymId,

				timing: profile.timing,
				openDays: profile.openDays,
				...(profile.instagram && { instagram: profile.instagram }),

				genderAllowed: profile.genderAllowed,
				ownerName: profile.ownerName,
				ownerContact: profile.ownerContact,
				...(profile.amenities && { amenities: profile.amenities }),
				...(imagePaths && { images: imagePaths }),

				...(profile.fitnessProfession && {
					fitnessProfession: profile.fitnessProfession,
				}),
				...(profile.referralOffer && { referralOffer: profile.referralOffer }),
			},
		});
	};
	findByIdWithProfile = async ({
		gymId,
		isDeleted = false,
	}: {
		gymId: string;
		isDeleted: boolean;
	}): Promise<gym_with_profile | null> => {
		return await this.client.gym.findUnique({
			where: {
				id: gymId,
				isDeleted,
			},
			include: {
				gymProfile: true,
				machines: true,
				_count: {
					select: {
						members: {
							where: {
								isDeleted: false,
							},
						},
					},
				},
			},
		});
	};
	findByUser = async ({
		ownerId,
		isDeleted = false,
	}: {
		ownerId: string;
		isDeleted: boolean;
	}): Promise<{ id: string } | null> => {
		return await this.client.gym.findUnique({
			where: {
				isDeleted_ownerId: {
					isDeleted: isDeleted,
					ownerId: ownerId,
				},
			},
			select: {
				id: true,
			},
		});
	};
	findById = async ({
		gymId,
		isDeleted = false,
	}: {
		gymId: string;
		isDeleted?: boolean;
	}): Promise<Prisma.GymGetPayload<{
		include: {
			settings: true;
			owner: true;
		};
	}> | null> => {
		return await this.client.gym.findUnique({
			where: {
				id: gymId,
				isDeleted,
			},
			include: {
				settings: true,
				owner: true,
			},
		});
	};
	update = async (
		gymId: string,
		data: {
			name?: string;
			address?: string;
			biometricCounter?: number;
		},
		autoIncr: boolean = false,
	): Promise<void> => {
		await this.client.gym.update({
			where: {
				id: gymId,
			},
			data: {
				...(data.name && { name: data.name }),
				...(data.address && { address: data.address }),
				...(autoIncr && { biometricCounter: { increment: 1 } }),
				...(data.biometricCounter && {
					biometricCounter: { increment: data.biometricCounter },
				}),
			},
		});
	};
	delete = async (gymId: string): Promise<void> => {
		await this.client.gym.update({
			where: {
				id: gymId,
			},
			data: {
				isDeleted: true,
			},
		});
	};
	upsertProfile = async (
		gymId: string,
		profile: UpdateGym["profile"],
		finalImages?: string[],
	): Promise<void> => {
		if (!profile) {
			return;
		}

		await this.client.gymProfile.upsert({
			where: { gymId },

			create: {
				gymId,
				timing: profile.timing ?? "09:00 - 21:00",
				openDays: profile.openDays ?? [],
				...(profile.instagram && {
					instagram: profile.instagram,
				}),
				genderAllowed: profile.genderAllowed ?? "ALL",
				ownerName: profile.ownerName ?? "Unknown",
				ownerContact: profile.ownerContact ?? "Unknown",
				amenities: profile.amenities ?? [],
				images: finalImages ?? [],
				fitnessProfession: profile.fitnessProfession ?? null,
				referralOffer: profile.referralOffer ?? null,
			},

			update: {
				...(profile.timing && {
					timing: profile.timing,
				}),

				...(profile.openDays && {
					openDays: profile.openDays,
				}),

				...(profile.instagram !== undefined && {
					instagram: profile.instagram,
				}),

				...(profile.genderAllowed && {
					genderAllowed: profile.genderAllowed,
				}),

				...(profile.ownerName && {
					ownerName: profile.ownerName,
				}),

				...(profile.ownerContact && {
					ownerContact: profile.ownerContact,
				}),

				...(profile.amenities && {
					amenities: profile.amenities,
				}),

				...(finalImages !== undefined && {
					images: finalImages,
				}),

				fitnessProfession: profile.fitnessProfession ?? null,

				referralOffer: profile.referralOffer ?? null,
			},
		});
	};
	findMemberByUserId = async (userId: string): Promise<{ gymId: string } | null> => {
		return this.client.member.findUnique({
			where: { userId },
			select: { gymId: true },
		});
	};
	createPlan = async (planData: CreatePlanRepoInput) => {
		return await this.client.plan.create({
			data: {
				billingCycle: planData.billing_cycle,
				name: planData.plan_name,
				price: planData.planAmount,
				razorpayId: planData.rzp_planID,
			},
		});
	};
}
