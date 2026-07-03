import { env } from "../../env";
import type { CheckInType, Gym, Payment, Prisma, PrismaClient } from "../../generated/client";
import { MemberError, MemberErrorCode } from "../../shared/errors/member-errors";
import type { AuthenticatedUser } from "../../shared/types/auth.types";
import type {
	ListMembersQuery,
	MarkAttendance,
	OnboardMember,
	ReportQuery,
	UpdateMember,
} from "../../shared/types/member.types";
import type { CreateMemberMembershipInput } from "../../shared/types/payment.types";
import type { BaseResponse } from "../../shared/types/returns";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import { MachineRepository } from "../repositories/machine.repository";
import {
	type AttendanceReport,
	type GymOverviewReport,
	type MemberAttendanceOut,
	type MemberDashboardOut,
	type MemberIncludingUser,
	type MemberListResult,
	type MemberMetricsReport,
	MemberRepository,
	type MemberWithDetails,
} from "../repositories/member.repository";

export class MemberService {
	private readonly memberRepository: MemberRepository;
	private readonly machineRepository: MachineRepository;
	private readonly logger: AppLogger;

	constructor({ prisma = client }: { prisma: PrismaClient }) {
		this.memberRepository = new MemberRepository(prisma);
		this.logger = new AppLogger();
		this.machineRepository = new MachineRepository(prisma);
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
				throw new MemberError(MemberErrorCode.CONFLICT, "A member with this email already exists");
			}
		}

		const member = await this.memberRepository.create(gymId, data);

		if (data.isMachine && data.serialNumbers) {
			await this.machineRepository.addUser({
				memberName: member.name,
				biometricCode: member.biometricCode,
				apiKey: env.MACHINE_SERVER_API_KEY,
				serialNumbers: data.serialNumbers,
				cardNumber: data.cardNumber,
				IsBioPasswordUpload: data.IsBioPasswordUpload ?? false,
				IsCardUpload: data.IsCardUpload ?? false,
				IsFaceUpload: data.IsFaceUpload ?? false,
				IsFPUpload: data.IsFPUpload ?? false,
			});
			if (member.currentMembership?.endDate) {
				await this.machineRepository.setUserExpiration({
					apiKey: env.MACHINE_SERVER_API_KEY,
					biometricCode: member.biometricCode,
					expirationDate: member.currentMembership?.endDate,
					serialNumbers: data.serialNumbers,
				});
			}
		}

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
		if (data.email !== undefined && data.email !== null && data.email !== member.email) {
			const existingEmail = await this.memberRepository.findByEmail(data.email);
			if (existingEmail) {
				throw new MemberError(MemberErrorCode.CONFLICT, "A member with this email already exists");
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
		serialNumbers: string[],
		isMachine: boolean,
		__user: AuthenticatedUser,
	): Promise<BaseResponse<null>> {
		this.logger.debug("deactivateMember: fetching member", { memberId, gymId });

		const member = await this.memberRepository.findByIdAndGym(memberId, gymId);
		if (!member) {
			throw new MemberError(MemberErrorCode.NOT_FOUND);
		}

		const newStatus = member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

		await this.memberRepository.updateStatus(memberId, newStatus);

		if (isMachine) {
			await this.machineRepository.toggleUserBlock({
				apiKey: env.MACHINE_SERVER_API_KEY,
				serialNumbers,
				biometricCode: member.biometricCode,
				block: newStatus === "INACTIVE",
			});
		}

		this.logger.debug("status changed success", {
			memberId,
			status: newStatus,
		});

		return {
			message: "Members status changed successfully",
			success: true,
			data: null,
		};
	}
	async deleteMember(
		memberId: string,
		gymId: string,
		serialNumbers: string[] | undefined,
		isMachine: boolean,
		__user: AuthenticatedUser,
	): Promise<BaseResponse<null>> {
		this.logger.debug("deactivateMember: fetching member", { memberId, gymId });

		const member = await this.memberRepository.findByIdAndGym(memberId, gymId);
		if (!member) {
			throw new MemberError(MemberErrorCode.NOT_FOUND);
		}

		if (member.isDeleted) {
			throw new MemberError(MemberErrorCode.BAD_REQUEST, "Member is already deleted");
		}

		await this.memberRepository.delete(memberId);

		if (isMachine && serialNumbers) {
			await this.machineRepository.removeUser({
				apiKey: env.MACHINE_SERVER_API_KEY,
				serialNumbers,
				biometricCode: member.biometricCode,
			});
		}

		return {
			message: "Members deleted successfully",
			success: true,
			data: null,
		};
	}
	async markAttendance(
		data: MarkAttendance,
		user: AuthenticatedUser,
	): Promise<BaseResponse<{ type: CheckInType; timestamp: Date }>> {
		const member = await this.memberRepository.getMemberDashboard(user.memberId!);

		if (!member || !member) {
			throw new MemberError(MemberErrorCode.BAD_REQUEST, "member not found");
		}

		if (member.gym.hash !== data.gym_hash) {
			throw new MemberError(MemberErrorCode.UNAUTHORIZED, "member not from this gym");
		}
		const log = await this.memberRepository.markAttendance(member, data.day);

		return {
			message: `Checked in successfully`,
			success: true,
			data: { type: log.type, timestamp: log.timestamp },
		};
	}

	async getGymOverviewReport(
		gymId: string,
		query: ReportQuery,
		_user: AuthenticatedUser,
	): Promise<BaseResponse<GymOverviewReport>> {
		this.logger.debug("getGymOverviewReport: fetching", { gymId });

		const report = await this.memberRepository.getGymOverviewReport(gymId, query);

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

		const report = await this.memberRepository.getAttendanceReport(gymId, query);

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

		const report = await this.memberRepository.getMemberMetricsReport(gymId, query);

		return {
			message: "Member metrics report fetched successfully",
			success: true,
			data: report,
		};
	}
	async getMemberAttendance(memberId: string): Promise<BaseResponse<MemberAttendanceOut>> {
		this.logger.debug("getMemberattendance completed", memberId);
		const attendance = await this.memberRepository.getMemberattendance(memberId);
		return {
			message: "attendances fetched successfully",
			success: true,
			data: attendance,
		};
	}
	async getGymAttendance(gymId: string, date: Date): Promise<BaseResponse<MemberAttendanceOut>> {
		this.logger.debug("getMemberGym request recieved");
		const gym = await this.memberRepository.getGymAttendance(gymId, date);
		if (!gym) {
			throw new MemberError(MemberErrorCode.NOT_FOUND, "gym not found");
		}
		return {
			message: "gym attendances fetched successfully",
			success: true,
			data: gym,
		};
	}
	async getMemberGym(memberId: string): Promise<BaseResponse<Gym>> {
		this.logger.debug("getMemberGym request recieved");
		const gym = await this.memberRepository.getMemberGym(memberId);
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
	async profile(memberId: string): Promise<BaseResponse<MemberIncludingUser>> {
		this.logger.debug("profile request recieved , memberId is :", memberId);
		const profile = await this.memberRepository.profile(memberId);
		if (!profile) {
			throw new MemberError(MemberErrorCode.NOT_FOUND, "member not found");
		}
		return {
			message: "profile fetched successfully",
			success: true,
			data: profile,
		};
	}
	async getMemberDashboard(memberId: string): Promise<BaseResponse<MemberDashboardOut>> {
		this.logger.debug("getMemberDashboard request recieved , memberId is : ", {
			id: memberId,
		});
		const dashboard = await this.memberRepository.getMemberDashboard(memberId);
		if (!dashboard || !dashboard.currentMembership) {
			throw new MemberError(MemberErrorCode.NOT_FOUND, "no dashboard with member found");
		}
		const plan_name =
			dashboard.currentMembership.planName ?? dashboard.currentMembership.planType.toString();
		const res: MemberDashboardOut = {
			gymId: dashboard?.gymId,
			memberId: dashboard?.id,
			name: dashboard?.name,
			plan: plan_name,
			days_left: dashboard.currentMembership.endDate,
			activity_graph: dashboard.attendanceAggregate,
			due_amount: dashboard.currentMembership.dueAmount,
		};
		return {
			message: "dashboard fetched successfully",
			success: true,
			data: res,
		};
	}
	async getGymOccupancy(memberId: string): Promise<BaseResponse<number>> {
		this.logger.debug("getGymOccupancy request recieved");
		const [total_members, checkOuts] = await this.memberRepository.getGymOccupancy(memberId);

		return {
			message: "Occupancy fetched successfully",
			success: true,
			data: Math.max(0, checkOuts / total_members),
		};
	}
	async getMemberMembership(memberId: string): Promise<
		BaseResponse<
			Prisma.MembershipGetPayload<{
				include: {
					payments: true;
				};
			}>[]
		>
	> {
		const membership = await this.memberRepository.getMemberMembership(memberId);
		return {
			message: "memberships fetched successfully",
			success: true,
			data: membership,
		};
	}
	async createMemberMembership(
		memberId: string,
		data: CreateMemberMembershipInput,
	): Promise<BaseResponse<null>> {
		const membership = await this.memberRepository.createMemberMembership(memberId, data);
		if (data.isMachine && data.serialNumber && membership.endDate) {
			await this.machineRepository.setUserExpiration({
				apiKey: env.MACHINE_SERVER_API_KEY,
				biometricCode: membership.member.biometricCode,
				expirationDate: membership.endDate,
				serialNumbers: data.serialNumber,
			});
		}
		return {
			message: "memberships create successfully",
			success: true,
		};
	}
}
