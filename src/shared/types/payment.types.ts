import z from "zod";
import type { Payment, Prisma } from "../../generated/client";
import { MembershipPlanType, PaymentMethod, TransactionType } from "../../generated/enums";
import type { paginationReturnType } from "./returns";

export const createPaymentSchema = z.object({
	amount: z.coerce.number().min(1),
	paidDate: z.coerce.date(),
	description: z.string().max(255).optional(),
	method: z.enum(PaymentMethod),
	transactionType: z.enum(TransactionType),
	category: z.string().min(1).max(100),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export type CreatePaymentOutput = Prisma.PaymentGetPayload<{
	select: {
		id: true;
	};
}>;
export const getPaymentsQuerySchema = z.object({
	page: z.coerce.number().int().positive().optional().default(1),
	limit: z.coerce.number().int().positive().max(100).optional().default(20),
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional(),
	memberId: z.string().optional(),
});

export type GetPaymentsOutput = {
	payments: Payment[];
	netRevenue: number;
	totalRevenue: number;
	totalExpense: number;
	pagination: paginationReturnType;
};
export const createMembershipSchema = z.object({
	planType: z.enum(MembershipPlanType),
	startDate: z.coerce.date(),
	planName: z.string().min(1).max(100),
	dueAmount: z.coerce.number(),
	membershipAmount: z.coerce.number(),
	predecessor: z.string().min(1).max(100),
	serialNumber: z.array(z.string()).optional(),
	isMachine: z.boolean(),
});
export type CreateMemberMembershipInput = z.infer<typeof createMembershipSchema>;
