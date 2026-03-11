import {
  CreatePaymentInput,
  CreatePaymentOutput,
  GetPaymentsOutput,
} from "../../shared/types/payment.types";
import { AppLogger } from "../../shared/utils/logger";
import { PaymentRepository } from "../repositories/payment.repositories";
import {
  PaymentError,
  PaymentErrorCode,
} from "../../shared/errors/payment-errors";
import { BaseResponse } from "../../shared/types/returns";
import { GymRepository } from "../repositories/gym.repository";
import { client } from "../../shared/utils/prisma";
import { AuthenticatedUser } from "@/shared/types/auth.types";

export class PaymentService {
  private paymentRepository: PaymentRepository;
  private gymRepository: GymRepository;
  private logger: AppLogger;

  constructor() {
    this.paymentRepository = new PaymentRepository();
    this.gymRepository = new GymRepository(client);

    this.logger = new AppLogger();
  }
  async createPayment(
    memberId: string,
    gymId: string,
    data: CreatePaymentInput,
  ): Promise<BaseResponse<CreatePaymentOutput>> {
    this.logger.debug("createPayment: creating payment");
    const new_payment = await this.paymentRepository.createPayment(
      memberId,
      gymId,
      data,
    );

    if (!new_payment.id)
      throw new PaymentError(
        PaymentErrorCode.BAD_REQUEST,
        "error creating payment",
      );
    this.logger.debug("payment created successfully");
    return {
      success: true,
      message: "payment created successfully",
      data: {
        id: new_payment.id,
      },
    };
  }
  async getGymPayments(
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
  ): Promise<BaseResponse<GetPaymentsOutput>> {
    this.logger.debug("getGymPayments: fetching payments", {
      gymId,
      page,
      limit,
      memberId,
    });

    const gymExists = await this.gymRepository.findById({ gymId: gymId });
    if (!gymExists)
      throw new PaymentError(PaymentErrorCode.NOT_FOUND, "Gym not found");

    const paymentsData = await this.paymentRepository.getPayments(
      gymExists.id,
      {
        page,
        limit,
        startDate,
        endDate,
        memberId,
      },
    );

    this.logger.debug("getGymPayments: payments fetched", {
      total: paymentsData.pagination.total,
      page: paymentsData.pagination.current,
      limit: paymentsData.pagination.limit,
    });

    return {
      success: true,
      message: "payments retrieved successfully",
      data: paymentsData,
    };
  }
  async deletePayment(
    paymentId: string,
    gymId: string,
    user: AuthenticatedUser,
  ): Promise<BaseResponse<{}>> {
    this.logger.debug("deletePayment: deleting payment", {
      paymentId,
      gymId,
      userId: user.id,
    });

    const gymExists = await this.gymRepository.findById({ gymId });
    if (!gymExists) {
      throw new PaymentError(PaymentErrorCode.NOT_FOUND, "Gym not found");
    }

    const deleted = await this.paymentRepository.deletePayment(
      paymentId,
      gymId,
    );
    if (!deleted) {
      throw new PaymentError(
        PaymentErrorCode.NOT_FOUND,
        "Payment not found or does not belong to this gym",
      );
    }

    this.logger.debug("deletePayment: payment deleted successfully", {
      paymentId,
    });

    return {
      success: true,
      message: "payment deleted successfully",
      data: {},
    };
  }
}
