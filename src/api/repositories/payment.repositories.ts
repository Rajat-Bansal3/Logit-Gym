import { client } from "@/shared/utils/prisma";
import { PaymentError, PaymentErrorCode } from "../../shared/errors/payment-errors";
import type {
	CreatePaymentInput,
	CreatePaymentOutput,
	GetPaymentsOutput,
} from "../../shared/types/payment.types";

export class PaymentRepository {
	async createPayment(
		memberId: string,
		gymId: string,
		data: CreatePaymentInput,
	): Promise<CreatePaymentOutput> {
		const member = await client.member.findUnique({
			where: { id: memberId },
			select: {
				gymId: true,
			},
		});
		if (!member) {
			throw new PaymentError(PaymentErrorCode.NOT_FOUND, "Member not found");
		}
		if (member.gymId !== gymId) {
			throw new PaymentError(PaymentErrorCode.FORBIDDEN, "Member does not belong to this gym");
		}
		const result = await client.$transaction(async (tx) => {
			const transaction = await tx.transaction.create({
				data: {
					amount: data.amount,
					method: data.method,
					type: data.transactionType,
					date: data.paidDate,
					gymId: gymId,
					memberId: memberId,
					...(data.description ? { description: data.description } : null),
					status: data.status,
				},
			});

			await tx.membership.update({
				where: { id: data.membershipId },
				data: { dueAmount: { decrement: data.amount } },
			});

			const payment = await tx.payment.create({
				data: {
					amount: data.amount,
					membershipId: data.membershipId,
					dueDate: data.dueDate,
					paidDate: data.paidDate,
					...(data.description ? { description: data.description } : null),
					status: data.status,
					memberId: memberId,
					gymId: gymId,
					transactionId: transaction.id,
				},
				include: {
					transaction: true,
				},
			});

			return payment.id;
		});

		return { id: result };
	}
	async getPayments(
		_gymId: string,
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
	): Promise<GetPaymentsOutput> {
		const total = await client.payment.count();
		const payments = await client.payment.findMany({
			where: {
				...(startDate && { paidDate: startDate }),
				...(endDate && { dueDate: endDate }),
				...(memberId && { memberId: memberId }),
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
	}
	async deletePayment(paymentId: string, gymId: string): Promise<boolean> {
		await client.payment.delete({
			where: {
				id: paymentId,
				gymId: gymId,
			},
		});
		return true;
	}
}
