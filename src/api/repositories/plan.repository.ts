import type {
	Plan,
	Prisma,
	PrismaClient,
	Subscription,
	SubscriptionStatus,
} from "../../generated/client";
import { computePeriodEnd } from "../../shared/utils/util_functions";

export type gym_with_sub = Prisma.GymGetPayload<{
	include: {
		subscriptions: {
			include: {
				plan: true;
			};
		};
		currentSubscription: {
			include: {
				plan: true;
			};
		};
	};
}> | null;

export class PlanRepository {
	private prisma: PrismaClient;
	constructor(prisma: PrismaClient) {
		this.prisma = prisma;
	}
	findByGatewayId = async (gatewaySubscriptionId: string) => {
		return this.prisma.subscription.findUnique({ where: { gatewaySubscriptionId } });
	};

	getPlan = async (planId: string): Promise<Plan | null> => {
		return await this.prisma.plan.findUnique({
			where: {
				id: planId,
			},
		});
	};
	getPlans = async (): Promise<Plan[]> => {
		return await this.prisma.plan.findMany({
			where: {
				isActive: true,
				name: {
					not: {
						equals: "TRIAL",
					},
				},
			},
		});
	};
	getSubscription = async (gymId: string): Promise<gym_with_sub> => {
		const gym_with_sub = await this.prisma.gym.findUnique({
			where: {
				id: gymId,
			},
			include: {
				subscriptions: {
					include: {
						plan: true,
					},
				},
				currentSubscription: {
					include: {
						plan: true,
					},
				},
			},
		});
		return gym_with_sub;
	};
	// createSub = async (
	// 	gymId: string,
	// 	planId: string,
	// 	gatewaySubscriptionId: string,
	// 	plan: Plan,
	// ): Promise<Subscription> => {
	// 	const currentPeriodStart = new Date();
	// 	const currentPeriodEnd = computePeriodEnd(currentPeriodStart, plan.billingCycle);

	// 	return await this.prisma.$transaction(async (tx) => {
	// 		const sub = await tx.subscription.create({
	// 			data: {
	// 				gymId,
	// 				planId,
	// 				status: plan.billingCycle === "TRIAL" ? "TRIALING" : "PENDING",
	// 				currentPeriodStart,
	// 				currentPeriodEnd,
	// 				cancelAtPeriodEnd: false,
	// 				gatewaySubscriptionId,
	// 			},
	// 		});

	// 		await tx.gym.update({
	// 			where: { id: gymId },
	// 			data: {
	// 				currentSubscriptionId: sub.id,
	// 				subscriptionStatus: plan.billingCycle === "TRIAL" ? "TRIALING" : "PENDING",
	// 			},
	// 		});

	// 		return sub;
	// 	});
	// };

	createSub = async (
		gymId: string,
		planId: string,
		gatewaySubscriptionId: string,
		plan: Plan,
	): Promise<Subscription> => {
		const isTrial = plan.billingCycle === "TRIAL";
		const currentPeriodStart = new Date();
		const currentPeriodEnd = computePeriodEnd(currentPeriodStart, plan.billingCycle);

		return await this.prisma.$transaction(async (tx) => {
			if (!isTrial) {
				// earlier abandoned checkouts are dead drafts
				await tx.subscription.updateMany({
					where: { gymId, status: "PENDING" },
					data: { status: "EXPIRED" },
				});
			}

			const sub = await tx.subscription.create({
				data: {
					gymId,
					planId,
					status: isTrial ? "TRIALING" : "PENDING",
					currentPeriodStart,
					currentPeriodEnd,
					cancelAtPeriodEnd: false,
					gatewaySubscriptionId,
				},
			});

			// Only a trial takes effect immediately. A paid plan becomes current
			// when the payment webhook confirms it.
			if (isTrial) {
				await tx.gym.update({
					where: { id: gymId },
					data: { currentSubscriptionId: sub.id, subscriptionStatus: "TRIALING" },
				});
			}

			return sub;
		});
	};

	// repository methods needed
	findActiveSubscription = async (gymId: string) => {
		return this.prisma.subscription.findFirst({
			where: {
				gymId,
				status: { in: ["ACTIVE"] },
			},
		});
	};

	updateSubscription = async (
		gatewaySubscriptionId: string,
		gymId: string,
		data: Partial<{
			status: SubscriptionStatus;
			currentPeriodStart: Date;
			currentPeriodEnd: Date;
			gracePeriodEnd: Date | null;
			renue_status: SubscriptionStatus;
			cancelAtPeriodEnd: boolean;
		}>,
	) => {
		// return this.prisma.$transaction(async (tx) => {
		// 	const sub = await tx.subscription.update({
		// 		where: { gatewaySubscriptionId },
		// 		data,
		// 	});

		// 	await tx.gym.update({
		// 		where: { id: gymId },
		// 		data: { ...(data.status && { subscriptionStatus: data.status }) },
		// 	});

		// 	return sub;
		// });
		return this.prisma.$transaction(async (tx) => {
			const sub = await tx.subscription.update({
				where: { gatewaySubscriptionId },
				data,
			});

			if (data.status) {
				const gym = await tx.gym.findUnique({
					where: { id: gymId },
					select: { currentSubscriptionId: true },
				});

				if (data.status === "ACTIVE") {
					// retire the previous current sub (e.g. the trial) so it can't linger
					if (gym?.currentSubscriptionId && gym.currentSubscriptionId !== sub.id) {
						await tx.subscription.update({
							where: { id: gym.currentSubscriptionId },
							data: { status: "CANCELLED" },
						});
					}
					await tx.gym.update({
						where: { id: gymId },
						data: { currentSubscriptionId: sub.id, subscriptionStatus: "ACTIVE" },
					});
				} else if (gym?.currentSubscriptionId === sub.id) {
					await tx.gym.update({
						where: { id: gymId },
						data: { subscriptionStatus: data.status },
					});
				}
				// else: a non-current (abandoned) sub got an event, so leave the gym alone
			}

			return sub;
		});
	};

	findInvoiceByGatewayId = async (gatewayInvoiceId: string) => {
		return this.prisma.subscriptionInvoice.findUnique({
			where: { gatewayInvoiceId },
		});
	};

	createInvoiceAndActivate = async (data: {
		gatewaySubscriptionId: string;
		gymId: string;
		amount: number;
		paidDate: Date;
		gatewayInvoiceId: string;
		currentPeriodStart: Date;
		currentPeriodEnd: Date;
	}) => {
		return this.prisma.$transaction(async (tx) => {
			const sub = await tx.subscription.update({
				where: { gatewaySubscriptionId: data.gatewaySubscriptionId },
				data: {
					status: "ACTIVE",
					currentPeriodStart: data.currentPeriodStart,
					currentPeriodEnd: data.currentPeriodEnd,
					gracePeriodEnd: null,
				},
			});

			await tx.subscriptionInvoice.create({
				data: {
					subscriptionId: sub.id,
					amount: data.amount,
					status: "PAID",
					dueDate: data.currentPeriodStart,
					paidDate: data.paidDate,
					gatewayInvoiceId: data.gatewayInvoiceId,
				},
			});

			// this is added to retire the previous current subscription if it exists

			const gym = await tx.gym.findUnique({
				where: { id: data.gymId },
				select: { currentSubscriptionId: true },
			});

			// retire the previous current sub (e.g. the trial)
			if (gym?.currentSubscriptionId && gym.currentSubscriptionId !== sub.id) {
				await tx.subscription.update({
					where: { id: gym.currentSubscriptionId },
					data: { status: "CANCELLED" },
				});
			}

			// set the new subscription as the current subscription for the gym
			await tx.gym.update({
				where: { id: data.gymId },
				data: { currentSubscriptionId: sub.id, subscriptionStatus: "ACTIVE" },
			});

			// await tx.gym.update({
			// 	where: { id: data.gymId },
			// 	data: { subscriptionStatus: "ACTIVE" },
			// });
		});
	};
}
