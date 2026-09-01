import type { Prisma } from "@/generated/client";
import type {
	CreatePaymentInput,
	CreatePaymentOutput,
	GetPaymentsOutput,
} from "../../shared/types/payment.types";
import { client } from "../../shared/utils/prisma";

export class PaymentRepository {
	createPayment = async (gymId: string, data: CreatePaymentInput): Promise<CreatePaymentOutput> => {
		console.log("💰 CREATE PAYMENT");
		console.log("amount:", data.amount);
		console.log("transactionType:", data.transactionType);
		console.log("transactionType type:", typeof data.transactionType);
		const payment = await client.payment.create({
			data: {
				amount: data.amount,
				paidDate: data.paidDate,
				...(data.description ? { description: data.description } : null),
				status: "PAID",
				gymId: gymId,
				category: data.category,
				type: data.transactionType,
			},
		});
		await client.gymMetrics.update({
			where: {
				gymId: gymId,
			},
			data: {
				totalRevenue: {
					...(data.transactionType === "CREDIT"
						? {
								increment: data.amount,
							}
						: {
								decrement: data.amount,
							}),
				},
			},
		});

		return { id: payment.id };
	};
	getPayments = async (
		gymId: string,
		{
			page = 1,
			limit = 10,
			startDate,
			endDate,
			memberId,
		}: {
			page: number | undefined;
			limit: number | undefined;
			startDate: Date | undefined;
			endDate: Date | undefined;
			memberId: string | undefined;
		},
	): Promise<GetPaymentsOutput> => {
		const where: Prisma.PaymentScalarWhereInput = {
			gymId,
			...(memberId && { memberId }),
			...((startDate || endDate) && {
				createdAt: {
					...(startDate && { gte: startDate }),
					...(endDate && { lte: endDate }),
				},
			}),
		};
		const [total, payments, revenuePayments] = await Promise.all([
			client.payment.count({ where }),
			client.payment.findMany({
				where,
				skip: limit * (page - 1),
				take: limit,
				orderBy: {
					paidDate: "desc",
				},
				include: {
					member: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			}),
			client.payment.findMany({
				where,
				orderBy: {
					paidDate: "desc",
				},
				include: {
					member: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			}),
		]);
		const out = revenuePayments.reduce(
			(acc, curr) => ({
				acc,
				totalRevenue: acc.totalRevenue + (curr.type === "CREDIT" ? curr.amount : 0),
				totalExpense: acc.totalExpense + (curr.type === "DEBIT" ? curr.amount : 0),
			}),
			{
				totalExpense: 0,
				totalRevenue: 0,
			},
		);
		return {
			payments,
			netRevenue: out.totalRevenue - out.totalExpense,
			totalExpense: out.totalExpense,
			totalRevenue: out.totalRevenue,
			pagination: {
				total,
				current: page,
				limit,
			},
		};
	};
	deletePayment = async (paymentId: string, gymId: string): Promise<boolean> => {
		await client.payment.delete({
			where: {
				id: paymentId,
				gymId: gymId,
			},
		});
		return true;
	};
}
