import type { PrismaClient } from "../../generated/client";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import { appLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import { razorpay } from "../../shared/utils/rzp";

const ADDON_AMOUNT_MINOR = 119900;
const PAYMENT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

export class MachineAddonService {
	constructor(private readonly prisma: PrismaClient = client) { }

	async assertMachineActive(gymId: string, serialNumber: string): Promise<void> {
		const machine = await this.prisma.machines.findFirst({
			where: { gymId, serialNumber },
			include: { machineAddonPurchase: true },
		});
		if (!machine) {
			throw new GymError(GymErrorCode.NOT_FOUND, "Machine not found for this gym");
		}
		if (machine.isLegacyAddon || !machine.machineAddonPurchase) return;

		const addon = machine.machineAddonPurchase;
		if (addon.status !== "ACTIVE" || !addon.expiresAt || addon.expiresAt <= new Date()) {
			throw new GymError(
				GymErrorCode.FORBIDDEN,
				`The add-on for machine ${machine.name} has expired. Renew its ₹1,199/year add-on to restore member access and attendance sync. Attendance from this machine is not synced while expired.`,
			);
		}
	}

	async getStatus(gymId: string) {
		const now = new Date();
		const machines = await this.prisma.machines.findMany({
			where: { gymId },
			include: { machineAddonPurchase: true },
		});
		const unassigned = await this.prisma.machineAddonPurchase.findMany({
			where: { gymId, status: "ACTIVE", expiresAt: { gt: now } },
			include: { machine: { select: { id: true } } },
			orderBy: { createdAt: "asc" },
		});
		const availableAddonCount = unassigned.filter((purchase) => !purchase.machine).length;
		const freeMachineAvailable = !machines.some(
			(machine) => !machine.isLegacyAddon && !machine.machineAddonPurchaseId,
		);

		return {
			price: ADDON_AMOUNT_MINOR / 100,
			currency: "INR",
			validityDays: 365,
			freeMachineAvailable,
			availableAddonCount,
			canAddMachine: freeMachineAvailable || availableAddonCount > 0,
			machines: machines.map((machine) => {
				const addon = machine.machineAddonPurchase;
				const active = Boolean(
					machine.isLegacyAddon ||
					!addon ||
					(addon.status === "ACTIVE" && addon.expiresAt && addon.expiresAt > now),
				);
				return {
					serialNumber: machine.serialNumber,
					machineName: machine.name,
					isAddon: Boolean(addon),
					isLegacyAddon: machine.isLegacyAddon,
					addonActive: active,
					addonExpiresAt: addon?.expiresAt ?? null,
				};
			}),
		};
	}

	async createPaymentLink(gymId: string, renewMachineSerialNumber?: string) {
		const gym = await this.prisma.gym.findUnique({
			where: { id: gymId },
			include: { owner: true },
		});
		if (!gym || gym.isDeleted) {
			throw new GymError(GymErrorCode.NOT_FOUND, "Gym not found");
		}

		if (renewMachineSerialNumber) {
			const machine = await this.prisma.machines.findFirst({
				where: { gymId, serialNumber: renewMachineSerialNumber },
				include: { machineAddonPurchase: true },
			});
			if (!machine || !machine.machineAddonPurchaseId) {
				throw new GymError(GymErrorCode.BAD_REQUEST, "This machine has no renewable add-on.");
			}
		}

		const purchase = await this.prisma.machineAddonPurchase.create({
			data: {
				gymId,
				status: "PENDING",
				amount: ADDON_AMOUNT_MINOR,
				currency: "INR",
				renewMachineSerialNumber: renewMachineSerialNumber ?? null,
			},
		});

		try {
			const paymentLink = await razorpay.paymentLink.create({
				amount: ADDON_AMOUNT_MINOR,
				currency: "INR",
				reference_id: purchase.id,
				description: `Synapse biometric machine add-on for ${gym.name} (1 year)`,
				customer: { name: gym.owner.username },
				notify: { email: false, sms: false, whatsapp: false },
				reminder_enable: false,
				expire_by: Math.floor(Date.now() / 1000) + PAYMENT_LINK_TTL_SECONDS,
				notes: {
					gymId,
					machineAddonPurchaseId: purchase.id,
					...(renewMachineSerialNumber ? { renewMachineSerialNumber } : {}),
				},
			});
			await this.prisma.machineAddonPurchase.update({
				where: { id: purchase.id },
				data: { razorpayPaymentLinkId: paymentLink.id },
			});
			return {
				purchaseId: purchase.id,
				paymentUrl: paymentLink.short_url,
				amount: ADDON_AMOUNT_MINOR / 100,
				currency: "INR",
				validityDays: 365,
			};
		} catch (error) {
			await this.prisma.machineAddonPurchase.update({
				where: { id: purchase.id },
				data: { status: "FAILED" },
			});
			appLogger.error("Failed to create machine add-on payment link", { gymId, error });
			throw new GymError(
				GymErrorCode.BAD_REQUEST,
				"Could not start the machine add-on payment. Please retry.",
			);
		}
	}

	async handlePaymentLinkPaid(
		paymentLinkId: string,
		paymentId: string,
		amountPaid: number,
		currency: string,
	) {
		await this.prisma.$transaction(async (tx) => {
			const purchase = await tx.machineAddonPurchase.findUnique({
				where: { razorpayPaymentLinkId: paymentLinkId },
			});
			if (!purchase) {
				appLogger.warn("Paid Razorpay link has no machine add-on purchase", { paymentLinkId });
				return;
			}
			if (purchase.status === "ACTIVE" && purchase.razorpayPaymentId === paymentId) return;
			if (currency !== purchase.currency || amountPaid < purchase.amount) {
				appLogger.error("Machine add-on payment amount mismatch", {
					purchaseId: purchase.id,
					amountPaid,
					currency,
					expected: purchase.amount,
				});
				return;
			}

			const now = new Date();
			let start = now;
			let renewedMachine: { id: string; machineAddonPurchaseId: string | null } | null = null;
			if (purchase.renewMachineSerialNumber) {
				renewedMachine = await tx.machines.findFirst({
					where: {
						gymId: purchase.gymId,
						serialNumber: purchase.renewMachineSerialNumber,
					},
					select: { id: true, machineAddonPurchaseId: true },
				});
				if (renewedMachine?.machineAddonPurchaseId) {
					const current = await tx.machineAddonPurchase.findUnique({
						where: { id: renewedMachine.machineAddonPurchaseId },
						select: { expiresAt: true },
					});
					if (current?.expiresAt && current.expiresAt > start) start = current.expiresAt;
				}
			}
			const expiresAt = new Date(start);
			expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);

			await tx.machineAddonPurchase.update({
				where: { id: purchase.id },
				data: {
					status: "ACTIVE",
					razorpayPaymentId: paymentId,
					expiresAt,
				},
			});

			if (renewedMachine) {
				if (renewedMachine.machineAddonPurchaseId) {
					await tx.machineAddonPurchase.updateMany({
						where: { id: renewedMachine.machineAddonPurchaseId, status: "ACTIVE" },
						data: { status: "REPLACED" },
					});
				}
				await tx.machines.update({
					where: { id: renewedMachine.id },
					data: { machineAddonPurchaseId: purchase.id },
				});
			}

			const existingPayment = await tx.payment.findUnique({
				where: { machineAddonPurchaseId: purchase.id },
				select: { id: true },
			});
			if (!existingPayment) {
				await tx.payment.create({
					data: {
						gymId: purchase.gymId,
						machineAddonPurchaseId: purchase.id,
						amount: purchase.amount / 100,
						paidDate: now,
						description: "Biometric machine add-on (1 year)",
						category: "Machine Add-on",
						type: "CREDIT",
						status: "SUCCESS",
					},
				});
				await tx.gymMetrics.update({
					where: { gymId: purchase.gymId },
					data: { totalRevenue: { increment: purchase.amount / 100 } },
				});
			}
		});
	}
}
