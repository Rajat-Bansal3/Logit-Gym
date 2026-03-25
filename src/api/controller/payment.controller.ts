import type { NextFunction, Request, Response } from "express";
import { PaymentError, PaymentErrorCode } from "../../shared/errors/payment-errors";
import { createPaymentSchema, getPaymentsQuerySchema } from "../../shared/types/payment.types";
import { AppLogger } from "../../shared/utils/logger";
import { PaymentService } from "../services/payment.service";

export class PaymentController {
	private paymentService: PaymentService;
	private logger: AppLogger;

	constructor() {
		this.paymentService = new PaymentService();
		this.logger = new AppLogger();
	}

	addPayment = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("addPayment: request received");

			const user = req.user;
			if (!user) {
				throw new PaymentError(PaymentErrorCode.UNAUTHORIZED, "user not authorised");
			}

			const gymId = req.params.gymId;
			if (!gymId || Array.isArray(gymId)) {
				throw new PaymentError(PaymentErrorCode.BAD_REQUEST, "gymId is required");
			}

			if (user.gymId !== gymId) {
				throw new PaymentError(PaymentErrorCode.FORBIDDEN, "access to this gym is forbidden");
			}

			const payload = createPaymentSchema.safeParse(req.body);
			if (!payload.success) {
				throw new PaymentError(PaymentErrorCode.BAD_REQUEST, "invalid payment data");
			}

			const payment = await this.paymentService.createPayment(
				payload.data.memberId,
				gymId,
				payload.data,
			);

			this.logger.debug("addPayment: completed", {
				userId: user.id,
				gymId,
				paymentId: payment.data?.id,
			});
			res.status(201).json(payment);
		} catch (error) {
			this.logger.error("addPayment: error", { error });
			next(error);
		}
	};

	getPayments = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getPayments: request received");

			const user = req.user;
			if (!user) {
				throw new PaymentError(PaymentErrorCode.UNAUTHORIZED, "user not authorised");
			}

			const gymId = req.params.gymId;
			if (!gymId || Array.isArray(gymId)) {
				throw new PaymentError(PaymentErrorCode.BAD_REQUEST, "gymId is required");
			}

			if (user.gymId !== gymId) {
				throw new PaymentError(PaymentErrorCode.FORBIDDEN, "access to this gym is forbidden");
			}

			const queryParse = getPaymentsQuerySchema.safeParse(req.query);
			if (!queryParse.success) {
				throw new PaymentError(PaymentErrorCode.BAD_REQUEST, "invalid query parameters");
			}

			const { page, limit, startDate, endDate, memberId } = queryParse.data;

			const result = await this.paymentService.getGymPayments(gymId, {
				page,
				limit,
				startDate,
				endDate,
				memberId,
			});

			this.logger.debug("getPayments: completed", { userId: user.id, gymId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("getPayments: error", { error });
			next(error);
		}
	};

	deletePayment = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("deletePayment: request received");

			const user = req.user;
			if (!user) {
				throw new PaymentError(PaymentErrorCode.UNAUTHORIZED, "user not authorised");
			}

			const { gymId, paymentId } = req.params;
			if (!gymId || Array.isArray(gymId) || !paymentId || Array.isArray(paymentId)) {
				throw new PaymentError(PaymentErrorCode.BAD_REQUEST, "gymId and paymentId are required");
			}

			if (user.gymId !== gymId) {
				throw new PaymentError(PaymentErrorCode.FORBIDDEN, "access to this gym is forbidden");
			}

			await this.paymentService.deletePayment(paymentId, gymId, user);

			this.logger.debug("deletePayment: completed", {
				userId: user.id,
				gymId,
				paymentId,
			});
			res.status(204).json({});
		} catch (error) {
			this.logger.error("deletePayment: error", { error });
			next(error);
		}
	};
}
