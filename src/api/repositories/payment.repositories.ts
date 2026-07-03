import type {
	CreatePaymentInput,
	CreatePaymentOutput,
	GetPaymentsOutput,
} from "../../shared/types/payment.types";
import { client } from "../../shared/utils/prisma";

export class PaymentRepository {
	createPayment = async (gymId: string, data: CreatePaymentInput): Promise<CreatePaymentOutput> => {
		const payment = await client.payment.create({
			data: {
				amount: data.amount,
				paidDate: data.paidDate,
				...(data.description ? { description: data.description } : null),
				status: "PAID", //REVIEW
				gymId: gymId,
				category: data.category,
			},
		});
		await client.gymMetrics.update({
			where: {
				gymId: gymId,
			},
			data: {
				totalRevenue: {
					increment: data.amount,
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
		const where = {
			gymId,
			...(memberId && { memberId }),
			...((startDate || endDate) && {
				createdAt: {
					...(startDate && { gte: startDate }),
					...(endDate && { lte: endDate }),
				},
			}),
		};
		console.log(startDate, endDate);
		const [total, payments] = await Promise.all([
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
		]);
		console.log(payments);
		return {
			payments,
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
