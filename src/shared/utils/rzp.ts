import Razorpay from "razorpay";
import { env } from "../../env";
import type { BillingCycle } from "../../generated/enums";

export const razorpay = new Razorpay({
	key_id: env.RAZORPAY_KEY_ID,
	key_secret: env.RAZORPAY_KEY_SECRET,
});

export async function createRZPPlan(plan: {
	name: string;
	amount: number;
	billingCycle: BillingCycle;
}): Promise<string> {
	const rzpPlan = await razorpay.plans.create({
		period: ["MONTHLY", "QUARTERLY", "HALF_YEARLY"].includes(plan.billingCycle)
			? "monthly"
			: "yearly",
		interval: 1,
		item: {
			name: plan.name,
			amount: plan.amount * 100,
			currency: "INR",
		},
	});

	return rzpPlan.id;
}
export async function createRZPSubscription(planId: string, gymId: string) {
	const rzpSub = await razorpay.subscriptions.create({
		plan_id: planId,
		total_count: 120,
		notes: {
			gymId: gymId,
		},
	});
	return rzpSub;
}
