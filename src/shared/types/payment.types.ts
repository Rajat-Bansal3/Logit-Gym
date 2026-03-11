import z from "zod";
import type { Prisma } from "../../generated/client";
import { PaymentMethod, PaymentStatus, TransactionType } from "../../generated/enums";
import type { paginationReturnType } from "./returns";

export const createPaymentSchema = z.object({
	amount: z.coerce.number().min(1),
	dueDate: z.coerce.date(),
	paidDate: z.coerce.date(),
	description: z.string().max(255).optional(),
	status: z.enum(PaymentStatus),
	method: z.enum(PaymentMethod),
	transactionType: z.enum(TransactionType),
	memberId: z.string().min(1).max(20),
	membershipId: z.string().min(1).max(20),
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
	payments: Prisma.PaymentGetPayload<{}>[];
	pagination: paginationReturnType;
};
