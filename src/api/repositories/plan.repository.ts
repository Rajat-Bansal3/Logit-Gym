import type {
	Plan,
	Prisma,
	PrismaClient,
	Subscription,
	SubscriptionStatus,
} from "../../generated/client";

export type gym_with_sub = Prisma.GymGetPayload<{
	include: {
		subscriptions: true;
		currentSubscription: true;
	};
}> | null;

export class PlanRepository {
	private prisma: PrismaClient;
	constructor(prisma: PrismaClient) {
		this.prisma = prisma;
	}
	getPlan = async (planId: string): Promise<Plan | null> => {
		return await this.prisma.plan.findUnique({
			where: {
				id: planId,
			},
		});
	};
	getPlans = async (): Promise<Plan[]> => {
		return await this.prisma.plan.findMany();
	};
	getSubscription = async (gymId: string): Promise<gym_with_sub> => {
		const gym_with_sub = await this.prisma.gym.findUnique({
			where: {
				id: gymId,
			},
			include: {
				subscriptions: true,
				currentSubscription: true,
			},
		});
		return gym_with_sub;
	};
	createSub = async (
		gymId: string,
		planId: string,
		gatewaySubscriptionId: string,
	): Promise<Subscription> => {
		const plan = await this.prisma.plan.findUnique({
			where: { id: planId },
		});
		if (!plan) {
			throw new Error("Plan not found");
		}

		const currentPeriodStart = new Date();
		const currentPeriodEnd = this.computePeriodEnd(currentPeriodStart, plan.billingCycle);

		return await this.prisma.$transaction(async (tx) => {
			const sub = await tx.subscription.create({
				data: {
					gymId,
					planId,
					status: "TRIALING",
					currentPeriodStart,
					currentPeriodEnd,
					cancelAtPeriodEnd: false,
					gatewaySubscriptionId,
				},
			});

			await tx.gym.update({
				where: { id: gymId },
				data: {
					currentSubscriptionId: sub.id,
					subscriptionStatus: "TRIALING",
				},
			});

			return sub;
		});
	};

	// repository methods needed
	findActiveSubscription = async (gymId: string) => {
		return this.prisma.subscription.findFirst({
			where: {
				gymId,
				status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
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
		}>,
	) => {
		return this.prisma.$transaction(async (tx) => {
			const sub = await tx.subscription.update({
				where: { gatewaySubscriptionId },
				data,
			});

			await tx.gym.update({
				where: { id: gymId },
				data: { ...(data.status && { subscriptionStatus: data.status }) },
			});

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

			await tx.gym.update({
				where: { id: data.gymId },
				data: { subscriptionStatus: "ACTIVE" },
			});
		});
	};

	private computePeriodEnd(start: Date, billingCycle: string): Date {
		const end = new Date(start);
		switch (billingCycle) {
			case "MONTHLY":
				end.setMonth(end.getMonth() + 1);
				break;
			case "QUARTERLY":
				end.setMonth(end.getMonth() + 3);
				break;
			case "HALF_YEARLY":
				end.setMonth(end.getMonth() + 6);
				break;
			case "YEARLY":
				end.setFullYear(end.getFullYear() + 1);
				break;
		}
		return end;
	}
}
