import { randomInt } from "node:crypto";
import type { PrismaClient } from "../../generated/client";
import { Prisma } from "../../generated/client";
import {
	OwnerReferralStatus,
	UserRole,
	WhatsAppWalletTransactionKind,
} from "../../generated/enums";
import { AppError } from "../../shared/errors/app-errors";
import { NotificationService } from "../../shared/services/notification.service";
import type { RegisterInput } from "../../shared/types/auth.types";
import { client } from "../../shared/utils/prisma";

const REFERRAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REFERRAL_REWARD_PAISE = 10_000;
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function isPaidGym(gym: {
	subscriptionStatus: string;
	currentSubscription: { status: string; plan: { price: number } } | null;
}): boolean {
	return (
		gym.subscriptionStatus === "ACTIVE" &&
		gym.currentSubscription?.status === "ACTIVE" &&
		gym.currentSubscription.plan.price > 0
	);
}

export class ReferralService {
	private prisma: PrismaClient;
	private notifications: NotificationService;

	constructor({ prisma = client }: { prisma?: PrismaClient } = {}) {
		this.prisma = prisma;
		this.notifications = new NotificationService(prisma);
	}

	async registerOwnerWithReferral(data: RegisterInput, hashedPassword: string) {
		const referralCode = data.referralCode;
		if (data.role !== UserRole.OWNER || !referralCode) {
			throw new AppError("Referral codes are only available when creating an owner account.", 400);
		}

		return this.prisma.$transaction(async (tx) => {
			const referrer = await tx.user.findUnique({
				where: { referralCode },
				select: {
					id: true,
					role: true,
					gym: {
						where: { isDeleted: false },
						select: {
							subscriptionStatus: true,
							currentSubscription: {
								select: {
									status: true,
									plan: { select: { price: true } },
								},
							},
						},
					},
				},
			});
			if (referrer?.role !== UserRole.OWNER || !referrer.gym.some((gym) => isPaidGym(gym))) {
				throw new AppError(
					"This referral code is invalid or its owner is not currently on a paid plan.",
					400,
				);
			}

			const now = new Date();
			const referredUser = await tx.user.create({
				data: {
					username: data.username,
					...(data.email && { email: data.email }),
					password: hashedPassword,
					role: UserRole.OWNER,
				},
				select: {
					id: true,
					username: true,
					password: true,
					role: true,
					gym: { select: { id: true } },
					member: { select: { id: true } },
				},
			});

			await tx.ownerReferral.create({
				data: {
					code: referralCode,
					referrerUserId: referrer.id,
					referredUserId: referredUser.id,
					referredAt: now,
					expiresAt: new Date(now.getTime() + REFERRAL_WINDOW_MS),
				},
			});

			return referredUser;
		});
	}

	async getOwnerOverview(ownerId: string) {
		const now = new Date();
		await this.expireReferrals(now);

		const [owner, gym] = await Promise.all([
			this.prisma.user.findUnique({
				where: { id: ownerId },
				select: { role: true, referralCode: true },
			}),
			this.prisma.gym.findFirst({
				where: { ownerId, isDeleted: false },
				select: {
					subscriptionStatus: true,
					currentSubscription: {
						select: {
							status: true,
							plan: { select: { price: true } },
						},
					},
				},
			}),
		]);
		if (owner?.role !== UserRole.OWNER) {
			throw new AppError("Owner account not found.", 404);
		}

		const eligibleToRefer = gym != null && isPaidGym(gym);
		const referralCode =
			eligibleToRefer && !owner.referralCode
				? await this.createPersistentCode(ownerId)
				: owner.referralCode;

		const referrals = await this.prisma.ownerReferral.findMany({
			where: { referrerUserId: ownerId },
			orderBy: { referredAt: "desc" },
			select: {
				id: true,
				code: true,
				status: true,
				rewardAmountPaise: true,
				referredAt: true,
				expiresAt: true,
				gymSetupAt: true,
				planPurchasedAt: true,
				completedAt: true,
				referrerRewardedAt: true,
				referredUser: {
					select: {
						username: true,
						gym: {
							where: { isDeleted: false },
							take: 1,
							select: { name: true },
						},
					},
				},
			},
		});

		return {
			eligibleToRefer,
			referralCode,
			rewardAmountPaise: REFERRAL_REWARD_PAISE,
			referrals: referrals.map((referral) => ({
				id: referral.id,
				code: referral.code,
				status: referral.status,
				referredOwnerName: referral.referredUser.username,
				referredGymName: referral.referredUser.gym[0]?.name ?? null,
				referredAt: referral.referredAt,
				expiresAt: referral.expiresAt,
				accountCreatedAt: referral.referredAt,
				gymSetupAt: referral.gymSetupAt,
				planPurchasedAt: referral.planPurchasedAt,
				completedAt: referral.completedAt,
				rewardAmountPaise: referral.rewardAmountPaise,
				referrerRewardedAt: referral.referrerRewardedAt,
			})),
		};
	}

	async rewardReferralForPaidInvoice(gymId: string, paymentId: string): Promise<void> {
		const invoice = await this.prisma.subscriptionInvoice.findUnique({
			where: { gatewayPaymentId: paymentId },
			select: {
				status: true,
				paidDate: true,
				subscription: {
					select: {
						gymId: true,
						plan: { select: { price: true } },
					},
				},
			},
		});
		if (
			invoice?.status !== "PAID" ||
			!invoice.paidDate ||
			invoice.subscription.gymId !== gymId ||
			invoice.subscription.plan.price <= 0
		) {
			return;
		}
		const paidAt = invoice.paidDate;

		const referredGym = await this.prisma.gym.findFirst({
			where: { id: gymId, isDeleted: false },
			select: { ownerId: true, createdAt: true },
		});
		if (!referredGym) {
			return;
		}
		const referral = await this.prisma.ownerReferral.findUnique({
			where: { referredUserId: referredGym.ownerId },
			select: { id: true },
		});
		if (!referral) {
			return;
		}

		const rewardedReferral = await this.prisma.$transaction(async (tx) => {
			const locked = await tx.$queryRaw<{ id: string }[]>`
				SELECT "id" FROM "owner_referrals" WHERE "id" = ${referral.id} FOR UPDATE
			`;
			if (!locked[0]) {
				return null;
			}

			const current = await tx.ownerReferral.findUnique({
				where: { id: referral.id },
				select: {
					id: true,
					code: true,
					status: true,
					referrerUserId: true,
					referredUserId: true,
					rewardAmountPaise: true,
					expiresAt: true,
					gymSetupAt: true,
				},
			});
			if (!current) {
				return null;
			}
			if (current.status === OwnerReferralStatus.REWARDED) {
				return current;
			}

			const gymSetupAt = current.gymSetupAt ?? referredGym.createdAt;
			if (paidAt > current.expiresAt || gymSetupAt > current.expiresAt) {
				await tx.ownerReferral.update({
					where: { id: current.id },
					data: {
						status: OwnerReferralStatus.EXPIRED,
						...(gymSetupAt <= current.expiresAt && { gymSetupAt }),
					},
				});
				return null;
			}

			const referrerGym = await tx.gym.findFirst({
				where: { ownerId: current.referrerUserId, isDeleted: false },
				select: { id: true },
			});
			if (!referrerGym) {
				throw new AppError("The referring owner's gym is unavailable for wallet credit.", 409);
			}

			const walletEntries = await Promise.all([
				tx.whatsAppWallet.upsert({
					where: { gymId: referrerGym.id },
					create: { gymId: referrerGym.id },
					update: {},
					select: { id: true, gymId: true },
				}),
				tx.whatsAppWallet.upsert({
					where: { gymId },
					create: { gymId },
					update: {},
					select: { id: true, gymId: true },
				}),
			]);

			const balances = new Map<string, number>();
			for (const wallet of [...walletEntries].sort((a, b) => a.id.localeCompare(b.id))) {
				const rows = await tx.$queryRaw<{ balancePaise: number }[]>`
					SELECT "balancePaise" FROM "whatsapp_wallets" WHERE "id" = ${wallet.id} FOR UPDATE
				`;
				if (!rows[0]) {
					throw new AppError("A referral wallet could not be found.", 409);
				}
				balances.set(wallet.id, rows[0].balancePaise);
			}

			const settings = await tx.whatsAppGlobalSettings.findUnique({
				where: { id: "global" },
				select: { lowBalanceThresholdPaise: true },
			});
			for (const wallet of walletEntries) {
				const balanceBefore = balances.get(wallet.id);
				if (balanceBefore == null) {
					throw new AppError("A referral wallet balance could not be read.", 409);
				}
				const balanceAfter = balanceBefore + current.rewardAmountPaise;
				if (balanceAfter > 2_147_483_647) {
					throw new AppError("A referral wallet balance exceeds the supported limit.", 409);
				}
				await tx.whatsAppWallet.update({
					where: { id: wallet.id },
					data: {
						balancePaise: { increment: current.rewardAmountPaise },
						...(balanceAfter > (settings?.lowBalanceThresholdPaise ?? 2_000) && {
							lowBalanceAlertSent: false,
						}),
					},
				});
				await tx.whatsAppWalletLedger.create({
					data: {
						walletId: wallet.id,
						kind: WhatsAppWalletTransactionKind.REFERRAL_REWARD,
						amountPaise: current.rewardAmountPaise,
						balanceBefore,
						balanceAfter,
						note: `Refer and Earn reward for ${current.code}`,
						referralId: current.id,
					},
				});
			}

			return tx.ownerReferral.update({
				where: { id: current.id },
				data: {
					status: OwnerReferralStatus.REWARDED,
					gymSetupAt,
					planPurchasedAt: paidAt,
					completedAt: paidAt,
					referrerRewardedAt: paidAt,
					referredRewardedAt: paidAt,
				},
				select: {
					id: true,
					code: true,
					status: true,
					referrerUserId: true,
					referredUserId: true,
					rewardAmountPaise: true,
					expiresAt: true,
					gymSetupAt: true,
				},
			});
		});

		if (rewardedReferral) {
			await this.notifications.notifyReferralReward(rewardedReferral.id);
		}
	}

	private async createPersistentCode(ownerId: string): Promise<string> {
		for (let attempt = 0; attempt < 8; attempt++) {
			const candidate = Array.from(
				{ length: 8 },
				() => REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)],
			).join("");
			try {
				await this.prisma.user.updateMany({
					where: { id: ownerId, referralCode: null },
					data: { referralCode: candidate },
				});
				const owner = await this.prisma.user.findUnique({
					where: { id: ownerId },
					select: { referralCode: true },
				});
				if (owner?.referralCode) {
					return owner.referralCode;
				}
			} catch (error) {
				if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
					continue;
				}
				throw error;
			}
		}
		throw new AppError("A referral code could not be created. Please try again.", 503);
	}

	private expireReferrals(now: Date) {
		return this.prisma.ownerReferral.updateMany({
			where: {
				status: OwnerReferralStatus.IN_PROGRESS,
				expiresAt: { lte: now },
			},
			data: { status: OwnerReferralStatus.EXPIRED },
		});
	}
}
