import { success } from "zod";
import type {
  AttendanceLog,
  CheckInType,
  Gym,
  Payment,
  PrismaClient,
} from "../../generated/client";
import {
  MemberError,
  MemberErrorCode,
} from "../../shared/errors/member-errors";
import type { AuthenticatedUser } from "../../shared/types/auth.types";
import type {
  ListMembersQuery,
  MarkAttendance,
  OnboardMember,
  ReportQuery,
  UpdateMember,
} from "../../shared/types/member.types";
import type { BaseResponse } from "../../shared/types/returns";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import {
  type AttendanceReport,
  type GymOverviewReport,
  MemberIncludingUser,
  type MemberListResult,
  type MemberMetricsReport,
  MemberRepository,
  type MemberWithDetails,
} from "../repositories/member.repository";

export class MemberService {
  private readonly memberRepository: MemberRepository;
  private readonly logger: AppLogger;

  constructor({ prisma = client }: { prisma: PrismaClient }) {
    this.memberRepository = new MemberRepository(prisma);
    this.logger = new AppLogger();
  }

  async onboardMember(
    gymId: string,
    data: OnboardMember,
    _user: AuthenticatedUser,
  ): Promise<BaseResponse<{ memberId: string }>> {
    this.logger.debug("onboardMember: checking for conflicts", { gymId });

    const existingPhone = await this.memberRepository.findByPhone(data.phone);
    if (existingPhone) {
      throw new MemberError(
        MemberErrorCode.CONFLICT,
        "A member with this phone number already exists",
      );
    }

    if (data.email) {
      const existingEmail = await this.memberRepository.findByEmail(data.email);
      if (existingEmail) {
        throw new MemberError(
          MemberErrorCode.CONFLICT,
          "A member with this email already exists",
        );
      }
    }

    const member = await this.memberRepository.create(gymId, data);

    this.logger.debug("onboardMember: success", { memberId: member.id });
    return {
      message: "Member onboarded successfully",
      success: true,
      data: { memberId: member.id },
    };
  }

  async getMember(
    memberId: string,
    gymId: string,
    __user: AuthenticatedUser,
  ): Promise<BaseResponse<MemberWithDetails>> {
    this.logger.debug("getMember: fetching member", { memberId, gymId });

    const member = await this.memberRepository.findByIdAndGym(memberId, gymId);
    if (!member) {
      throw new MemberError(MemberErrorCode.NOT_FOUND);
    }

    return {
      message: "Member fetched successfully",
      success: true,
      data: member,
    };
  }

  async listMembers(
    gymId: string,
    query: ListMembersQuery,
    __user: AuthenticatedUser,
  ): Promise<BaseResponse<MemberListResult>> {
    this.logger.debug("listMembers: fetching members", { gymId });

    const result = await this.memberRepository.listByGym(gymId, query);

    return {
      message: "Members fetched successfully",
      success: true,
      data: result,
    };
  }

  async updateMember(
    memberId: string,
    gymId: string,
    data: UpdateMember,
    __user: AuthenticatedUser,
  ): Promise<BaseResponse<MemberWithDetails>> {
    this.logger.debug("updateMember: fetching member", { memberId, gymId });

    const member = await this.memberRepository.findByIdAndGym(memberId, gymId);
    if (!member) {
      throw new MemberError(MemberErrorCode.NOT_FOUND);
    }

    // Phone uniqueness check — only if phone is being changed
    if (data.phone !== undefined && data.phone !== member.phone) {
      const existingPhone = await this.memberRepository.findByPhone(data.phone);
      if (existingPhone) {
        throw new MemberError(
          MemberErrorCode.CONFLICT,
          "A member with this phone number already exists",
        );
      }
    }

    // Email uniqueness check — only if email is being changed
    if (
      data.email !== undefined &&
      data.email !== null &&
      data.email !== member.email
    ) {
      const existingEmail = await this.memberRepository.findByEmail(data.email);
      if (existingEmail) {
        throw new MemberError(
          MemberErrorCode.CONFLICT,
          "A member with this email already exists",
        );
      }
    }

    const updated = await this.memberRepository.update(memberId, data);

    this.logger.debug("updateMember: success", { memberId });
    return {
      message: "Member updated successfully",
      success: true,
      data: updated,
    };
  }

  async deactivateMember(
    memberId: string,
    gymId: string,
    __user: AuthenticatedUser,
  ): Promise<BaseResponse<null>> {
    this.logger.debug("deactivateMember: fetching member", { memberId, gymId });

    const member = await this.memberRepository.findByIdAndGym(memberId, gymId);
    if (!member) {
      throw new MemberError(MemberErrorCode.NOT_FOUND);
    }

    if (member.status === "INACTIVE") {
      throw new MemberError(
        MemberErrorCode.BAD_REQUEST,
        "Member is already inactive",
      );
    }

    await this.memberRepository.softDelete(memberId);

    this.logger.debug("deactivateMember: success", { memberId });
    return {
      message: "Member deactivated successfully",
      success: true,
      data: null,
    };
  }
  async markAttendance(
    gymId: string,
    data: MarkAttendance,
    __user: AuthenticatedUser,
  ): Promise<BaseResponse<{ type: CheckInType; timestamp: Date }>> {
    this.logger.debug("markAttendance: looking up member", { gymId });

    const member =
      data.email !== undefined
        ? await this.memberRepository.findByEmailAndGym(data.email, gymId)
        : await this.memberRepository.findByPhoneAndGym(data.phone!, gymId);

    if (!member) {
      throw new MemberError(
        MemberErrorCode.NOT_FOUND,
        "Member not found in this gym",
      );
    }

    if (member.status !== "ACTIVE") {
      throw new MemberError(
        MemberErrorCode.BAD_REQUEST,
        `Cannot mark attendance — member is ${member.status.toLowerCase()}`,
      );
    }

    const log = await this.memberRepository.markAttendance(
      gymId,
      member.id,
      data.type,
    );

    this.logger.debug("markAttendance: success", {
      memberId: member.id,
      type: log.type,
    });
    return {
      message: `Checked ${log.type === "IN" ? "in" : "out"} successfully`,
      success: true,
      data: { type: log.type, timestamp: log.timestamp },
    };
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  async getGymOverviewReport(
    gymId: string,
    query: ReportQuery,
    _user: AuthenticatedUser,
  ): Promise<BaseResponse<GymOverviewReport>> {
    this.logger.debug("getGymOverviewReport: fetching", { gymId });

    const report = await this.memberRepository.getGymOverviewReport(
      gymId,
      query,
    );

    return {
      message: "Gym overview report fetched successfully",
      success: true,
      data: report,
    };
  }

  async getAttendanceReport(
    gymId: string,
    query: ReportQuery,
    _user: AuthenticatedUser,
  ): Promise<BaseResponse<AttendanceReport>> {
    this.logger.debug("getAttendanceReport: fetching", { gymId });

    const report = await this.memberRepository.getAttendanceReport(
      gymId,
      query,
    );

    return {
      message: "Attendance report fetched successfully",
      success: true,
      data: report,
    };
  }

  async getMemberMetricsReport(
    gymId: string,
    query: ReportQuery,
    _user: AuthenticatedUser,
  ): Promise<BaseResponse<MemberMetricsReport>> {
    this.logger.debug("getMemberMetricsReport: fetching", { gymId });

    const report = await this.memberRepository.getMemberMetricsReport(
      gymId,
      query,
    );

    return {
      message: "Member metrics report fetched successfully",
      success: true,
      data: report,
    };
  }
  async getMemberAttendance(
    userId: string,
  ): Promise<BaseResponse<AttendanceLog[]>> {
    this.logger.debug("getMemberAttendace completed", userId);
    const attendance = await this.memberRepository.getMemberAttendace(userId);
    return {
      message: "attendaces fetched successfully",
      success: true,
      data: attendance,
    };
  }
  async getMemberGym(userId: string): Promise<BaseResponse<Gym>> {
    this.logger.debug("getMemberGym request recieved");
    const gym = await this.memberRepository.getMemberGym(userId);
    if (!gym) {
      throw new MemberError(MemberErrorCode.NOT_FOUND, "member not found");
    }
    return {
      message: "gym fetched successfully",
      success: true,
      data: gym,
    };
  }
  async getMemberPayments(userId: string): Promise<BaseResponse<Payment[]>> {
    this.logger.debug("getMemberPayments request recieved");
    const payments = await this.memberRepository.getMemberPayments(userId);
    if (!payments) {
      throw new MemberError(MemberErrorCode.NOT_FOUND, "member not found");
    }
    return {
      message: "payments fetched successfully",
      success: true,
      data: payments,
    };
  }
  async profile(userId: string): Promise<BaseResponse<MemberIncludingUser>> {
    this.logger.debug("profile request recieved");
    const profile = await this.memberRepository.profile(userId);
    if (!profile) {
      throw new MemberError(MemberErrorCode.NOT_FOUND, "member not found");
    }
    return {
      message: "profile fetched successfully",
      success: true,
      data: profile,
    };
  }
  async getMemberDashboard(
    userId: string,
  ): Promise<BaseResponse<MemberIncludingUser>> {
    this.logger.debug("getMemberDashboard request recieved");
    const dashboard = await this.memberRepository.getMemberDashboard(userId);
    if (!dashboard) {
      throw new MemberError(MemberErrorCode.NOT_FOUND, "member not found");
    }
    return {
      message: "dashboard fetched successfully",
      success: true,
      data: dashboard,
    };
  }
}
