import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/client";
import {
	WhatsAppMessageStatus,
	WhatsAppTemplateCategory,
	WhatsAppWalletTransactionKind,
} from "../../generated/enums";
import { AppError } from "../../shared/errors/app-errors";
import { fcmService } from "../../shared/services/fcm.service";
import { appLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";

const FREE_UTILITY_LIMIT = 100;
const DEFAULT_LOW_BALANCE_THRESHOLD_PAISE = 2000;
const WHATSAPP_MEMBER_PAGE_SIZE = 100;

export type WhatsAppProviderRequest = {
	to: string;
	templateKey: string;
	language: string;
	parameters: string[];
	idempotencyKey: string;
};

export interface WhatsAppProvider {
	readonly name: string;
	readonly configured: boolean;
	sendTemplate(input: WhatsAppProviderRequest): Promise<{ messageId: string }>;
}

class UnconfiguredWhatsAppProvider implements WhatsAppProvider {
	readonly name = "UNCONFIGURED";
	readonly configured = false;

	async sendTemplate(): Promise<never> {
		throw new AppError(
			"WhatsApp sending is not set up yet. No message or charge was made. Please contact Synapse support.",
			503,
		);
	}
}

const provider: WhatsAppProvider = new UnconfiguredWhatsAppProvider();

const messageInclude = {
	template: { select: { name: true } },
} satisfies Prisma.WhatsAppMessageInclude;

const memberSelect = {
	id: true,
	name: true,
	phone: true,
	status: true,
	currentMembership: { select: { endDate: true, isPaused: true } },
	whatsappConsent: {
		select: { utilityOptIn: true, marketingOptIn: true },
	},
} satisfies Prisma.MemberSelect;

type WhatsAppMemberRecord = Prisma.MemberGetPayload<{ select: typeof memberSelect }>;

function serializeMember(member: WhatsAppMemberRecord) {
	return {
		id: member.id,
		name: member.name,
		phone: member.phone,
		status: member.status,
		membershipEndDate: member.currentMembership?.endDate,
		membershipPaused: member.currentMembership?.isPaused ?? false,
		utilityOptIn: member.whatsappConsent?.utilityOptIn ?? false,
		marketingOptIn: member.whatsappConsent?.marketingOptIn ?? false,
	};
}

function normalizeIndianPhone(phone: string | null): string {
	const digits = (phone ?? "").replace(/\D/g, "");
	if (digits.length === 10) {
		return `91${digits}`;
	}
	if (digits.length === 12 && digits.startsWith("91")) {
		return digits;
	}
	if (digits.length === 11 && digits.startsWith("0")) {
		return `91${digits.slice(1)}`;
	}
	throw new AppError(
		"This member needs a valid Indian mobile number before you can message them.",
		400,
	);
}

function friendlyProviderFailure(error: unknown): { message: string; code: string } {
	if (error instanceof AppError) {
		return { message: error.message, code: "PROVIDER_NOT_CONFIGURED" };
	}
	return {
		message:
			"We couldn't send this WhatsApp message. Please check the number and try again later. Your balance and free messages were not used.",
		code: "PROVIDER_SEND_FAILED",
	};
}

function serializeMessage<
	T extends {
		id: string;
		recipientName: string;
		recipientPhone: string;
		category: WhatsAppTemplateCategory;
		status: WhatsAppMessageStatus;
		createdAt: Date;
		sentAt: Date | null;
		deliveredAt: Date | null;
		chargePaise: number;
		isFree: boolean;
		balanceBefore: number;
		balanceAfter: number;
		failureReason: string | null;
		template?: { name: string } | null;
	},
>(message: T) {
	return {
		id: message.id,
		recipientName: message.recipientName,
		recipientPhone: message.recipientPhone,
		templateName: message.template?.name ?? "Template",
		category: message.category,
		status: message.status,
		createdAt: message.createdAt,
		sentAt: message.sentAt,
		deliveredAt: message.deliveredAt,
		chargePaise: message.chargePaise,
		freeUtilityApplied: message.isFree,
		balanceBeforePaise: message.balanceBefore,
		balanceAfterPaise: message.balanceAfter,
		failureMessage: message.failureReason,
	};
}

export class WhatsAppService {
	async getAdminData() {
		const settings = await client.whatsAppGlobalSettings.upsert({
			where: { id: "global" },
			create: { id: "global" },
			update: {},
		});
		const [templates, gyms] = await Promise.all([
			client.whatsAppTemplate.findMany({ orderBy: { createdAt: "desc" } }),
			client.gym.findMany({
				where: { isDeleted: false },
				orderBy: { updatedAt: "desc" },
				select: {
					id: true,
					name: true,
					owner: { select: { username: true } },
					whatsappWallet: {
						select: {
							id: true,
							enabled: true,
							balancePaise: true,
							utilityFreeUsed: true,
						},
					},
				},
			}),
		]);
		const wallets = gyms.map((gym) => ({
			gym: { id: gym.id, name: gym.name, owner: gym.owner },
			gymId: gym.id,
			enabled: gym.whatsappWallet?.enabled ?? false,
			balancePaise: gym.whatsappWallet?.balancePaise ?? 0,
			utilityFreeUsed: gym.whatsappWallet?.utilityFreeUsed ?? 0,
		}));
		return { settings, templates, wallets };
	}

	async setAdminSettings(pricePerMessagePaise: number | null, lowBalanceThresholdPaise: number) {
		return client.whatsAppGlobalSettings.upsert({
			where: { id: "global" },
			create: { id: "global", pricePerMessagePaise, lowBalanceThresholdPaise },
			update: { pricePerMessagePaise, lowBalanceThresholdPaise },
		});
	}

	async saveTemplate(input: {
		id?: string;
		category: WhatsAppTemplateCategory;
		externalTemplateKey: string;
		name: string;
		language: string;
		previewText: string;
		variableNames: string[];
		providerApproved: boolean;
		isVisible: boolean;
	}) {
		const data = {
			category: input.category,
			externalTemplateKey: input.externalTemplateKey,
			name: input.name,
			language: input.language,
			previewText: input.previewText,
			variableNames: input.variableNames,
			providerApproved: input.providerApproved,
			isVisible: input.isVisible,
		};
		if (!input.id) {
			return client.whatsAppTemplate.create({ data });
		}
		const existing = await client.whatsAppTemplate.findUnique({ where: { id: input.id } });
		if (!existing) {
			throw new AppError("Template not found.", 404);
		}
		return client.whatsAppTemplate.update({ where: { id: input.id }, data });
	}

	async creditWallet(gymId: string, amountPaise: number, note: string) {
		const gym = await client.gym.findFirst({
			where: { id: gymId, isDeleted: false },
			select: { id: true },
		});
		if (!gym) {
			throw new AppError("Gym not found.", 404);
		}
		const wallet = await this.ensureWallet(gymId);
		const settings = await client.whatsAppGlobalSettings.findUnique({ where: { id: "global" } });
		return client.$transaction(async (tx) => {
			const rows = await tx.$queryRaw<{ balancePaise: number }[]>`
				SELECT "balancePaise" FROM "whatsapp_wallets" WHERE "id" = ${wallet.id} FOR UPDATE
			`;
			if (!rows[0]) {
				throw new AppError("Wallet could not be found.", 404);
			}
			const current = rows[0];
			const nextBalance = current.balancePaise + amountPaise;
			const updated = await tx.whatsAppWallet.update({
				where: { id: wallet.id },
				data: {
					balancePaise: { increment: amountPaise },
					...(nextBalance >
						(settings?.lowBalanceThresholdPaise ?? DEFAULT_LOW_BALANCE_THRESHOLD_PAISE) && {
						lowBalanceAlertSent: false,
					}),
				},
			});
			await tx.whatsAppWalletLedger.create({
				data: {
					walletId: wallet.id,
					kind: WhatsAppWalletTransactionKind.TOP_UP,
					amountPaise,
					balanceBefore: current.balancePaise,
					balanceAfter: nextBalance,
					note,
				},
			});
			return { gymId, balancePaise: updated.balancePaise };
		});
	}

	private assertOwnerGym = async (gymId: string, ownerId: string) => {
		const gym = await client.gym.findFirst({
			where: { id: gymId, ownerId, isDeleted: false },
			select: { id: true },
		});
		if (!gym) {
			throw new AppError("This gym is not available for your account.", 404);
		}
		return gym;
	};

	private ensureWallet = async (gymId: string) =>
		client.whatsAppWallet.upsert({
			where: { gymId },
			create: { gymId },
			update: {},
		});

	async getOverview(gymId: string, ownerId: string) {
		await this.assertOwnerGym(gymId, ownerId);
		const wallet = await this.ensureWallet(gymId);
		const settings = await client.whatsAppGlobalSettings.upsert({
			where: { id: "global" },
			create: { id: "global" },
			update: {},
		});
		const [templates, members, history] = await Promise.all([
			client.whatsAppTemplate.findMany({
				where: { isVisible: true, providerApproved: true },
				orderBy: [{ category: "asc" }, { name: "asc" }],
				select: {
					id: true,
					name: true,
					category: true,
					language: true,
					previewText: true,
					variableNames: true,
				},
			}),
			client.member.findMany({
				where: {
					gymId,
					isDeleted: false,
				},
				orderBy: [{ name: "asc" }, { id: "asc" }],
				take: WHATSAPP_MEMBER_PAGE_SIZE + 1,
				select: memberSelect,
			}),
			client.whatsAppMessage.findMany({
				where: { gymId },
				orderBy: { createdAt: "desc" },
				take: 20,
				include: messageInclude,
			}),
		]);

		return {
			enabled: wallet.enabled,
			balancePaise: wallet.balancePaise,
			freeUtilityMessagesUsed: wallet.utilityFreeUsed,
			freeUtilityMessagesRemaining: Math.max(
				0,
				FREE_UTILITY_LIMIT - wallet.utilityFreeUsed - wallet.utilityFreeReserved,
			),
			pricePerMessagePaise: settings.pricePerMessagePaise,
			lowBalanceThresholdPaise: settings.lowBalanceThresholdPaise,
			providerConfigured: provider.configured,
			templates: templates.map((template) => ({
				...template,
				variables: Array.isArray(template.variableNames) ? template.variableNames : [],
				variableNames: undefined,
			})),
			members: members.slice(0, WHATSAPP_MEMBER_PAGE_SIZE).map(serializeMember),
			hasMoreMembers: members.length > WHATSAPP_MEMBER_PAGE_SIZE,
			history: history.map(serializeMessage),
		};
	}

	async listMembers(gymId: string, ownerId: string, page: number, limit: number) {
		await this.assertOwnerGym(gymId, ownerId);
		const members = await client.member.findMany({
			where: { gymId, isDeleted: false },
			orderBy: [{ name: "asc" }, { id: "asc" }],
			skip: (page - 1) * limit,
			take: limit + 1,
			select: memberSelect,
		});
		return {
			members: members.slice(0, limit).map(serializeMember),
			hasMore: members.length > limit,
		};
	}

	async setEnabled(gymId: string, ownerId: string, enabled: boolean) {
		await this.assertOwnerGym(gymId, ownerId);
		await client.whatsAppWallet.upsert({
			where: { gymId },
			create: { gymId, enabled },
			update: { enabled },
		});
		return { enabled };
	}

	async setConsent(
		gymId: string,
		ownerId: string,
		memberId: string,
		input: { utilityOptIn: boolean; marketingOptIn: boolean },
	) {
		await this.assertOwnerGym(gymId, ownerId);
		const member = await client.member.findFirst({
			where: { id: memberId, gymId, isDeleted: false },
			select: { id: true },
		});
		if (!member) {
			throw new AppError("Member not found in this gym.", 404);
		}
		const current = await client.whatsAppConsent.findUnique({ where: { memberId } });
		const now = new Date();
		await client.whatsAppConsent.upsert({
			where: { memberId },
			create: {
				memberId,
				recordedBy: ownerId,
				...input,
				utilityOptedInAt: input.utilityOptIn ? now : null,
				marketingOptedInAt: input.marketingOptIn ? now : null,
			},
			update: {
				recordedBy: ownerId,
				...input,
				utilityOptedInAt: input.utilityOptIn
					? current?.utilityOptIn
						? current.utilityOptedInAt
						: now
					: null,
				marketingOptedInAt: input.marketingOptIn
					? current?.marketingOptIn
						? current.marketingOptedInAt
						: now
					: null,
			},
		});
		return { memberId, ...input };
	}

	async listHistory(gymId: string, ownerId: string, page: number, limit: number) {
		await this.assertOwnerGym(gymId, ownerId);
		const rows = await client.whatsAppMessage.findMany({
			where: { gymId },
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * limit,
			take: limit,
			include: messageInclude,
		});
		return rows.map(serializeMessage);
	}

	async sendMessage(
		gymId: string,
		ownerId: string,
		memberId: string,
		templateId: string,
		idempotencyKey: string,
	) {
		await this.assertOwnerGym(gymId, ownerId);
		const previousAttempt = await client.whatsAppMessage.findUnique({
			where: { gymId_idempotencyKey: { gymId, idempotencyKey } },
			include: messageInclude,
		});
		if (previousAttempt) {
			return serializeMessage(previousAttempt);
		}
		const [wallet, member, template, settings] = await Promise.all([
			this.ensureWallet(gymId),
			client.member.findFirst({
				where: { id: memberId, gymId, isDeleted: false },
				select: {
					id: true,
					name: true,
					phone: true,
					currentMembership: { select: { endDate: true } },
					whatsappConsent: true,
				},
			}),
			client.whatsAppTemplate.findFirst({
				where: { id: templateId, isVisible: true, providerApproved: true },
			}),
			client.whatsAppGlobalSettings.findUnique({ where: { id: "global" } }),
		]);
		if (!wallet.enabled) {
			throw new AppError("Turn on WhatsApp messaging for this gym first.", 409);
		}
		if (!member) {
			throw new AppError("Member not found in this gym.", 404);
		}
		if (!template) {
			throw new AppError("This message template is no longer available.", 409);
		}
		const allowed =
			template.category === WhatsAppTemplateCategory.UTILITY
				? member.whatsappConsent?.utilityOptIn
				: member.whatsappConsent?.marketingOptIn;
		if (!allowed) {
			throw new AppError(
				template.category === WhatsAppTemplateCategory.UTILITY
					? "This member has not agreed to receive WhatsApp updates. Record their permission first."
					: "This member has not agreed to receive WhatsApp offers. Record their permission first.",
				409,
			);
		}
		const phone = normalizeIndianPhone(member.phone);
		const useFree = template.category === WhatsAppTemplateCategory.UTILITY;
		const price = settings?.pricePerMessagePaise ?? null;
		if (!provider.configured) {
			const failed = await client.whatsAppMessage.create({
				data: {
					gymId,
					walletId: wallet.id,
					memberId,
					memberIdSnapshot: memberId,
					templateId,
					templateKeySnapshot: template.externalTemplateKey,
					idempotencyKey,
					recipientName: member.name,
					recipientPhone: `+${phone}`,
					category: template.category,
					provider: provider.name,
					status: WhatsAppMessageStatus.FAILED,
					failureReason:
						"WhatsApp sending is not set up yet. No message or charge was made. Please contact Synapse support.",
					failureCode: "PROVIDER_NOT_CONFIGURED",
					balanceBefore: wallet.balancePaise,
					balanceAfter: wallet.balancePaise,
				},
				include: messageInclude,
			});
			return serializeMessage(failed);
		}
		if (price !== null && price <= 0) {
			throw new AppError("Paid WhatsApp messaging is not available yet. No message was sent.", 409);
		}
		const messageId = randomUUID();
		let reservation: { free: boolean; before: number; after: number; chargePaise: number };
		try {
			reservation = await client.$transaction(async (tx) => {
				let before = wallet.balancePaise;
				let after = wallet.balancePaise;
				let free = false;
				let chargePaise = 0;
				if (useFree) {
					const rows = await tx.$queryRaw<{ balancePaise: number }[]>`
						UPDATE "whatsapp_wallets"
						SET "utilityFreeReserved" = "utilityFreeReserved" + 1,
						    "updatedAt" = CURRENT_TIMESTAMP
						WHERE "id" = ${wallet.id}
						  AND "utilityFreeUsed" + "utilityFreeReserved" < ${FREE_UTILITY_LIMIT}
						RETURNING "balancePaise"
					`;
					if (rows.length > 0 && rows[0]) {
						before = rows[0].balancePaise;
						after = before;
						free = true;
					}
				}
				if (!free) {
					if (price === null) {
						throw new AppError(
							useFree
								? "Your 100 free utility messages are used. Paid messaging is not available yet."
								: "Paid WhatsApp messaging is not available yet. No message was sent.",
							409,
						);
					}
					chargePaise = price;
					const rows = await tx.$queryRaw<{ balancePaise: number }[]>`
						SELECT "balancePaise" FROM "whatsapp_wallets"
						WHERE "id" = ${wallet.id}
						FOR UPDATE
					`;
					const current = rows[0];
					if (!current) {
						throw new AppError("Your WhatsApp wallet could not be found.", 404);
					}
					if (current.balancePaise < chargePaise) {
						throw new AppError(
							"Your WhatsApp balance is too low. Contact Synapse to top up and try again.",
							402,
						);
					}
					before = current.balancePaise;
					after = before - chargePaise;
					await tx.whatsAppWallet.update({
						where: { id: wallet.id },
						data: { balancePaise: after },
					});
				}
				if (chargePaise > 0) {
					await tx.whatsAppWalletLedger.create({
						data: {
							walletId: wallet.id,
							kind: WhatsAppWalletTransactionKind.MESSAGE_CHARGE,
							amountPaise: -chargePaise,
							balanceBefore: before,
							balanceAfter: after,
							reference: messageId,
							note: `WhatsApp ${template.category.toLowerCase()} message`,
						},
					});
				}
				await tx.whatsAppMessage.create({
					data: {
						id: messageId,
						gymId,
						walletId: wallet.id,
						memberId,
						memberIdSnapshot: memberId,
						templateId,
						templateKeySnapshot: template.externalTemplateKey,
						idempotencyKey,
						recipientName: member.name,
						recipientPhone: `+${phone}`,
						category: template.category,
						provider: provider.name,
						status: WhatsAppMessageStatus.PENDING,
						isFree: free,
						chargePaise,
						balanceBefore: before,
						balanceAfter: after,
					},
				});
				return { free, before, after, chargePaise };
			});
		} catch (error) {
			if (error instanceof AppError) {
				throw error;
			}
			if ((error as { code?: string }).code === "P2002") {
				const existing = await client.whatsAppMessage.findUnique({
					where: { gymId_idempotencyKey: { gymId, idempotencyKey } },
					include: messageInclude,
				});
				if (existing) {
					return serializeMessage(existing);
				}
			}
			throw error;
		}

		const gym = await client.gym.findUniqueOrThrow({
			where: { id: gymId },
			select: { name: true },
		});
		const variableNames = Array.isArray(template.variableNames)
			? template.variableNames.map(String)
			: [];
		const values: Record<string, string> = {
			name: member.name,
			member_name: member.name,
			gym_name: gym.name,
			expiry_date: member.currentMembership?.endDate?.toLocaleDateString("en-IN") ?? "",
		};
		let providerResult: { messageId: string };
		try {
			providerResult = await provider.sendTemplate({
				to: `+${phone}`,
				templateKey: template.externalTemplateKey,
				language: template.language,
				parameters: variableNames.map((name) => values[name] ?? ""),
				idempotencyKey: messageId,
			});
		} catch (error) {
			const failure = friendlyProviderFailure(error);
			let balanceAfterFailure = reservation.after;
			appLogger.error("WhatsApp message provider failed", {
				gymId,
				messageId,
				code: failure.code,
				error,
			});
			await client.$transaction(async (tx) => {
				if (reservation.free) {
					await tx.whatsAppWallet.update({
						where: { id: wallet.id },
						data: { utilityFreeReserved: { decrement: 1 } },
					});
				} else if (reservation.chargePaise > 0) {
					const rows = await tx.$queryRaw<{ balancePaise: number }[]>`
						SELECT "balancePaise" FROM "whatsapp_wallets"
						WHERE "id" = ${wallet.id}
						FOR UPDATE
					`;
					const current = rows[0];
					if (!current) {
						throw new AppError("Your WhatsApp wallet could not be found.", 404);
					}
					const beforeRefund = current.balancePaise;
					const afterRefund = beforeRefund + reservation.chargePaise;
					balanceAfterFailure = afterRefund;
					await tx.whatsAppWallet.update({
						where: { id: wallet.id },
						data: { balancePaise: { increment: reservation.chargePaise } },
					});
					await tx.whatsAppWalletLedger.create({
						data: {
							walletId: wallet.id,
							kind: WhatsAppWalletTransactionKind.MESSAGE_REFUND,
							amountPaise: reservation.chargePaise,
							balanceBefore: beforeRefund,
							balanceAfter: afterRefund,
							reference: messageId,
							note: "Message failed; charge returned",
						},
					});
				}
				await tx.whatsAppMessage.update({
					where: { id: messageId },
					data: {
						status: WhatsAppMessageStatus.FAILED,
						failureReason: failure.message,
						failureCode: failure.code,
						isFree: false,
						chargePaise: 0,
						balanceAfter: balanceAfterFailure,
					},
				});
			});
			return serializeMessage(
				await client.whatsAppMessage.findUniqueOrThrow({
					where: { id: messageId },
					include: messageInclude,
				}),
			);
		}
		const completed = await client.$transaction(async (tx) => {
			if (reservation.free) {
				await tx.whatsAppWallet.update({
					where: { id: wallet.id },
					data: {
						utilityFreeReserved: { decrement: 1 },
						utilityFreeUsed: { increment: 1 },
					},
				});
			}
			return tx.whatsAppMessage.update({
				where: { id: messageId },
				data: {
					status: WhatsAppMessageStatus.SENT,
					sentAt: new Date(),
					providerMessageId: providerResult.messageId,
				},
				include: messageInclude,
			});
		});
		if (
			reservation.after <=
			(settings?.lowBalanceThresholdPaise ?? DEFAULT_LOW_BALANCE_THRESHOLD_PAISE)
		) {
			try {
				await this.notifyLowBalance(gymId, ownerId, wallet.id, reservation.after);
			} catch (notificationError) {
				appLogger.error("WhatsApp low-balance notification failed", {
					gymId,
					error: notificationError,
				});
			}
		}
		return serializeMessage(completed);
	}

	private async notifyLowBalance(
		gymId: string,
		ownerId: string,
		walletId: string,
		balancePaise: number,
	) {
		const claimed = await client.whatsAppWallet.updateMany({
			where: { id: walletId, lowBalanceAlertSent: false },
			data: { lowBalanceAlertSent: true },
		});
		if (claimed.count !== 1) {
			return;
		}
		const tokens = await client.deviceToken.findMany({
			where: { userId: ownerId },
			select: { token: true },
		});
		const result = await fcmService.sendToTokens({
			tokens: tokens.map(({ token }) => token),
			title: "WhatsApp balance is low",
			body: `Your gym WhatsApp balance is ₹${(balancePaise / 100).toFixed(2)}. Contact Synapse to top up.`,
			data: { type: "whatsapp_low_balance", gymId },
		});
		if (result.sent === 0) {
			await client.whatsAppWallet.update({
				where: { id: walletId },
				data: { lowBalanceAlertSent: false },
			});
		}
	}
}
