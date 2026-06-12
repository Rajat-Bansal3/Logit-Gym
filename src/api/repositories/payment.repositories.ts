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
		const total = await client.payment.count({
			where: {
				gymId: gymId,
			},
		});
		const payments = await client.payment.findMany({
			where: {
				...(startDate && { paidDate: startDate }),
				...(endDate && { dueDate: endDate }),
				...(memberId && { memberId: memberId }),
				gymId: gymId,
			},
			skip: limit * (page - 1),
			take: limit,
		});
		return {
			payments: payments,
			pagination: {
				total: total,
				current: page,
				limit: limit,
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
