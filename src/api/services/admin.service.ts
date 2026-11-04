import { z } from "zod";
import { AppError } from "../../shared/errors/app-errors";
import { client } from "../../shared/utils/prisma";
import { createRZPPlan, razorpay } from "../../shared/utils/rzp";

const createPlanSchema = z.object({
	name: z.string().trim().min(1).max(80),
	price: z.number().positive(),
	billingCycle: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]),
	interval: z.number().int().min(1).max(12),
});

export const adminPlanInputSchema = createPlanSchema;
export const extendTrialInputSchema = z.object({ days: z.number().int().min(1).max(365) });
export const gymStatusInputSchema = z.object({ suspended: z.boolean() });
export const refundInputSchema = z.object({
	invoiceId: z.string().min(1),
	reason: z.string().trim().min(3).max(500),
});

export class AdminService {
	getOverview = async () => {
		const [
			gyms,
			deletedGyms,
			users,
			members,
			activeGyms,
			suspendedGyms,
			subscriptionRevenue,
			gymCollections,
			openInvoices,
			failedPayments,
			failedSubscriptionInvoices,
			subscriptionStates,
			processedRefunds,
		] = await Promise.all([
			client.gym.count(),
			client.gym.count({ where: { isDeleted: true } }),
			client.user.count(),
			client.member.count({ where: { isDeleted: false } }),
			client.gym.count({ where: { isDeleted: false, subscriptionStatus: "ACTIVE" } }),
			client.gym.count({ where: { isDeleted: false, isSuspended: true } }),
			client.subscriptionInvoice.aggregate({
				where: { status: "PAID" },
				_sum: { amount: true },
			}),
			client.payment.aggregate({
				where: { status: { in: ["PAID", "SUCCESS"] } },
				_sum: { amount: true },
			}),
			client.subscriptionInvoice.count({ where: { status: { in: ["PENDING", "OVERDUE"] } } }),
			client.payment.count({ where: { status: "FAILED" } }),
			client.subscriptionInvoice.count({ where: { status: "FAILED" } }),
			client.gym.groupBy({ by: ["subscriptionStatus"], where: { isDeleted: false }, _count: true }),
			client.adminRefundRequest.aggregate({
				where: { status: "PROCESSED" },
				_sum: { amount: true },
			}),
		]);

		const refunds = processedRefunds._sum.amount ?? 0;
		return {
			gyms,
			deletedGyms,
			users,
			members,
			activeGyms,
			suspendedGyms,
			trialGyms:
				subscriptionStates.find((item) => item.subscriptionStatus === "TRIALING")?._count ?? 0,
			pendingGyms:
				subscriptionStates.find((item) => item.subscriptionStatus === "PENDING")?._count ?? 0,
			expiredGyms:
				subscriptionStates.find((item) => item.subscriptionStatus === "EXPIRED")?._count ?? 0,
			synapseRevenue: Math.max(0, (subscriptionRevenue._sum.amount ?? 0) - refunds),
			gymCollections: gymCollections._sum.amount ?? 0,
			openInvoices,
			failedPayments: failedPayments + failedSubscriptionInvoices,
			processedRefunds: refunds,
		};
	};

	getGyms = async () => {
		const subscriptionTotals = await client.subscriptionInvoice.groupBy({
			by: ["subscriptionId"],
			where: { status: "PAID" },
			_sum: { amount: true },
		});
		const [gyms, subscriptions, collectionTotals] = await Promise.all([
			client.gym.findMany({
				orderBy: { createdAt: "desc" },
				select: {
					id: true,
					name: true,
					createdAt: true,
					isSuspended: true,
					subscriptionStatus: true,
					owner: { select: { username: true, email: true } },
					currentSubscription: {
						select: {
							status: true,
							trialEndsAt: true,
							currentPeriodEnd: true,
							plan: { select: { name: true } },
						},
					},
					_count: { select: { members: { where: { isDeleted: false } } } },
				},
			}),
			client.subscription.findMany({
				where: { id: { in: subscriptionTotals.map((total) => total.subscriptionId) } },
				select: { id: true, gymId: true },
			}),
			client.payment.groupBy({
				by: ["gymId"],
				where: { status: { in: ["PAID", "SUCCESS"] } },
				_sum: { amount: true },
			}),
		]);

		const gymBySubscription = new Map(subscriptions.map((sub) => [sub.id, sub.gymId]));
		const revenueByGym = new Map<string, number>();
		for (const total of subscriptionTotals) {
			const gymId = gymBySubscription.get(total.subscriptionId);
			if (gymId) {
				revenueByGym.set(gymId, (revenueByGym.get(gymId) ?? 0) + (total._sum.amount ?? 0));
			}
		}
		const collectionsByGym = new Map(
			collectionTotals.map((total) => [total.gymId, total._sum.amount ?? 0]),
		);

		return gyms.map((gym) => ({
			...gym,
			memberCount: gym._count.members,
			subscriptionRevenue: revenueByGym.get(gym.id) ?? 0,
			gymCollections: collectionsByGym.get(gym.id) ?? 0,
			_count: undefined,
		}));
	};

	getPlans = async () => client.plan.findMany({ orderBy: { createdAt: "desc" } });

	createPlan = async (input: z.infer<typeof createPlanSchema>) => {
		const rzpPlanId = await createRZPPlan({
			name: input.name,
			amount: input.price,
			billingCycle: input.billingCycle,
			interval: input.interval,
		});
		return client.plan.create({
			data: {
				name: input.name,
				price: input.price,
				billingCycle: input.billingCycle,
				razorpayId: rzpPlanId,
			},
		});
	};

	setPlanActive = async (planId: string, isActive: boolean) =>
		client.plan.update({ where: { id: planId }, data: { isActive } });

	setGymSuspended = async (gymId: string, suspended: boolean) => {
		const gym = await client.gym.findFirst({
			where: { id: gymId, isDeleted: false },
			select: { id: true },
		});
		if (!gym) {
			throw new AppError("Gym not found", 404);
		}
		return client.gym.update({ where: { id: gymId }, data: { isSuspended: suspended } });
	};

	extendTrial = async (gymId: string, days: number) => {
		const gym = await client.gym.findFirst({
			where: { id: gymId, isDeleted: false },
			select: { id: true, currentSubscriptionId: true, currentSubscription: true },
		});
		if (gym?.currentSubscription?.status !== "TRIALING") {
			throw new AppError("Gym does not have an active trial subscription", 409);
		}
		const currentSubscription = gym.currentSubscription;
		const currentEnd = currentSubscription.currentPeriodEnd;
		const trialEndsAt = new Date(Math.max(currentEnd.getTime(), Date.now()) + days * 86_400_000);
		return client.$transaction(async (tx) => {
			const subscription = await tx.subscription.update({
				where: { id: currentSubscription.id },
				data: { currentPeriodEnd: trialEndsAt, trialEndsAt },
			});
			await tx.gym.update({ where: { id: gymId }, data: { subscriptionStatus: "TRIALING" } });
			return subscription;
		});
	};

	getBilling = async () => {
		const [invoices, memberPayments, pendingSubscriptions, refunds] = await Promise.all([
			client.subscriptionInvoice.findMany({
				where: { status: { in: ["PAID", "PENDING", "OVERDUE", "FAILED"] } },
				orderBy: { createdAt: "desc" },
				take: 100,
				include: {
					subscription: { include: { plan: true, gym: { select: { id: true, name: true } } } },
					refundRequest: true,
				},
			}),
			client.payment.findMany({
				where: { status: { in: ["PENDING", "OVERDUE", "FAILED"] } },
				orderBy: { updatedAt: "desc" },
				take: 100,
				include: { gym: { select: { id: true, name: true } }, member: { select: { name: true } } },
			}),
			client.subscription.findMany({
				where: { OR: [{ status: "PENDING" }, { renue_status: "PENDING" }] },
				orderBy: { updatedAt: "desc" },
				take: 100,
				include: { plan: true, gym: { select: { id: true, name: true } } },
			}),
			client.adminRefundRequest.findMany({
				orderBy: { createdAt: "desc" },
				take: 100,
				include: {
					invoice: { include: { subscription: { include: { gym: { select: { name: true } } } } } },
				},
			}),
		]);
		return { invoices, memberPayments, pendingSubscriptions, refunds };
	};

	requestRefund = async (invoiceId: string, reason: string, requestedBy: string) => {
		const invoice = await client.subscriptionInvoice.findUnique({
			where: { id: invoiceId },
			include: { subscription: { include: { gym: { select: { name: true } } } } },
		});
		if (invoice?.status !== "PAID") {
			throw new AppError("Paid invoice not found", 404);
		}
		const paymentId = invoice.gatewayPaymentId ?? invoice.gatewayInvoiceId;
		if (!paymentId) {
			throw new AppError("No Razorpay payment ID is available for this invoice", 409);
		}

		const request = await client.adminRefundRequest.create({
			data: { invoiceId, amount: invoice.amount, reason, requestedBy, status: "PENDING" },
		});
		try {
			const refund = await razorpay.payments.refund(paymentId, {
				amount: Math.round(invoice.amount * 100),
				notes: { reason: reason.slice(0, 256), gym: invoice.subscription.gym.name },
			});
			return await client.adminRefundRequest.update({
				where: { id: request.id },
				data: { status: refund.status.toUpperCase(), gatewayRefundId: refund.id },
			});
		} catch (error) {
			await client.adminRefundRequest.update({
				where: { id: request.id },
				data: {
					status: "FAILED",
					errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Refund failed",
				},
			});
			throw error;
		}
	};
}
