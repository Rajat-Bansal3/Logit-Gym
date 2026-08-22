import { env } from "../../env";
import type { CheckInType, Gym, Payment, Prisma, PrismaClient } from "../../generated/client";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import { MemberError, MemberErrorCode } from "../../shared/errors/member-errors";
import type { AuthenticatedUser, ChangePasswordMember } from "../../shared/types/auth.types";
import type { bulkAddMembers, ValidMember } from "../../shared/types/gym.types";
import {
	type ListMembersQuery,
	type MarkAttendance,
	type MemberToMachine,
	machineFetchedMembers,
	type OnboardMember,
	type ReportQuery,
	type UpdateMember,
} from "../../shared/types/member.types";
import type { CreateMemberMembershipInput } from "../../shared/types/payment.types";
import type { BaseResponse } from "../../shared/types/returns";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import { BulkRepository } from "../repositories/bulk.repository";
import { GymRepository } from "../repositories/gym.repository";
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
import { AuthService } from "./auth.service";

export class MemberService {
	private readonly memberRepository: MemberRepository;
	private readonly gymRepository: GymRepository;
	private readonly machineRepository: MachineRepository;
	private readonly bulkRepository: BulkRepository;
	private readonly authService: AuthService;
	private readonly logger: AppLogger;

	constructor({ prisma = client }: { prisma: PrismaClient }) {
		this.memberRepository = new MemberRepository(prisma);
		this.gymRepository = new GymRepository(prisma);
		this.bulkRepository = new BulkRepository(prisma);
		this.logger = new AppLogger();
		this.authService = new AuthService();
		this.machineRepository = new MachineRepository(prisma);
	}

	async onboardMember(
		gymId: string,
		data: OnboardMember,
		_user: AuthenticatedUser,
		image?: string,
	): Promise<BaseResponse<{ memberId: string }>> {
		this.logger.debug("onboardMember: checking for conflicts", { gymId });
		const gym = await this.gymRepository.findById({ gymId, isDeleted: false });
		if (!gym) {
			throw new GymError(GymErrorCode.NOT_FOUND, "gym not found");
		}
		const existingPhone = await this.memberRepository.findByPhone(data.phone, gym.id);
		if (existingPhone) {
			throw new MemberError(
				MemberErrorCode.CONFLICT,
				"A member with this phone number already exists",
			);
		}
		let membershipCode = data.membershipCode;
		if (gym.settings && gym.startingMembershipCode && gym.settings.biometricPreference === "AUTO") {
			membershipCode = gym.startingMembershipCode + gym.biometricCounter;
		}

		if (!membershipCode) {
			throw new MemberError(MemberErrorCode.BAD_REQUEST, "membership code not provided");
		}
		await this.gymRepository.update(gymId, {}, gym.settings?.biometricPreference === "AUTO");
		const member = await this.memberRepository.create(
			gymId,
			membershipCode,
			data,
			gym.owner.username,
			image,
		);

		if (data.isMachine && data.serialNumbers) {
			await this.machineRepository.addUser({
				memberName: member.name,
				biometricCode: member.membershipCode,
				apiKey: env.MACHINE_SERVER_API_KEY,
				serialNumbers: data.serialNumbers,
				cardNumber: data.cardNumber,
				IsBioPasswordUpload: false,
				IsCardUpload: false,
				IsFaceUpload: false,
				IsFPUpload: false,
			});
			if (member.currentMembership?.endDate) {
				await this.machineRepository.setUserExpiration({
					apiKey: env.MACHINE_SERVER_API_KEY,
					biometricCode: member.membershipCode,
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
	async pushToMachine(
		gymId: string,
		data: MemberToMachine,
		_user: AuthenticatedUser,
	): Promise<BaseResponse<null>> {
		const machines = await this.machineRepository.getMachines(gymId, data.serialNumbers);
		if (machines.length < data.serialNumbers.length) {
			throw new MemberError(MemberErrorCode.NOT_FOUND, "one or more serial number not found");
		}
		await this.machineRepository.addUser({
			apiKey: env.MACHINE_SERVER_API_KEY,
			biometricCode: data.membershipCode,
			memberName: data.name,
			serialNumbers: data.serialNumbers,
			IsBioPasswordUpload: false,
			IsCardUpload: false,
			IsFaceUpload: false,
			IsFPUpload: false,
			cardNumber: undefined,
		});
		await this.memberRepository.createMemberMachines(
			machines.map((machine) => machine.id),
			data.memberId,
		);
		return {
			message: "Member assigned to machines successfully",
			success: true,
			data: null,
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
	async changePasswordMember(data: ChangePasswordMember) {
		const memberUser = await this.memberRepository.getMemberUser(data.username);
		if (!memberUser) {
			throw new MemberError(MemberErrorCode.NOT_FOUND, "member with username not found");
		}
		if (
			!(await this.authService.comparePassword(data.oldPassword, memberUser.password)) ||
			data.newPassword === data.oldPassword
		) {
			throw new MemberError(MemberErrorCode.FORBIDDEN, "Invalid credentials");
		}
		await this.memberRepository.changePassword({
			username: data.username,
			password: data.newPassword,
		});
		return;
	}

	async updateMember(
		memberId: string,
		gymId: string,
		data: UpdateMember,
		__user: AuthenticatedUser,
		image?: string,
	): Promise<BaseResponse<MemberWithDetails>> {
		this.logger.debug("updateMember: fetching member", {
			memberId,
			gymId,
		});

		const member = await this.memberRepository.findByIdAndGym(memberId, gymId);

		if (!member) {
			throw new MemberError(MemberErrorCode.NOT_FOUND);
		}

		if (data.phone !== undefined && data.phone !== member.phone) {
			const existingPhone = await this.memberRepository.findByPhone(data.phone, gymId);

			if (existingPhone) {
				throw new MemberError(
					MemberErrorCode.CONFLICT,
					"A member with this phone number already exists",
				);
			}
		}

		// New uploaded image
		if (image !== undefined) {
			data.avatarUrl = image;
		}

		const updated = await this.memberRepository.update(memberId, data);

		this.logger.debug("updateMember: success", {
			memberId,
			hasNewImage: image !== undefined,
		});

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
				biometricCode: member.membershipCode,
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
				biometricCode: member.membershipCode,
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
		if (!dashboard?.currentMembership) {
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
			metrics: dashboard.memberMetrics,
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
				biometricCode: membership.member.membershipCode,
				expirationDate: membership.endDate,
				serialNumbers: data.serialNumber,
			});
		}
		return {
			message: "memberships create successfully",
			success: true,
		};
	}
	async bulkOnboardExcelMembers(
		gymId: string,
		members: bulkAddMembers,
		_user: AuthenticatedUser,
	): Promise<
		BaseResponse<{
			count: number;
			failed: { row: number; reason: string }[];
		}>
	> {
		this.logger.debug("bulkOnboardMembers: starting", {
			gymId,
			count: members.length,
		});

		const gym = await this.gymRepository.findById({ gymId, isDeleted: false });
		if (!gym) {
			throw new GymError(GymErrorCode.NOT_FOUND, "gym not found");
		}

		const phones: string[] = members.map((r) => r.PhoneNumber.toString());
		const emails: string[] = members
			.filter((r): r is typeof r & { Email: string } => !!r.Email)
			.map((r) => r.Email);

		const [existingPhones, existingEmails] = await Promise.all([
			this.memberRepository.findManyByPhones(phones, gym.id),
			this.memberRepository.findManyByEmails(emails, gym.id),
		]);

		const existingPhoneSet = new Set<string>(
			existingPhones.map((m) => m.phone).filter((e): e is string => e !== null),
		);
		const existingEmailSet = new Set<string>(
			existingEmails.map((m) => m.email).filter((e): e is string => e !== null),
		);

		const failed: { row: number; reason: string }[] = [];
		const valid: ValidMember[] = [];

		for (let i = 0; i < members.length; i++) {
			const row = members[i];
			if (!row) {
				continue;
			}

			if (existingPhoneSet.has(row.PhoneNumber.toString())) {
				failed.push({
					row: i + 1,
					reason: `Phone ${row.PhoneNumber} already exists`,
				});
				continue;
			}

			if (row.Email && existingEmailSet.has(row.Email)) {
				failed.push({
					row: i + 1,
					reason: `Email ${row.Email} already exists`,
				});
				continue;
			}

			let membershipCode: number | undefined = row.EmployeeCode;

			if (
				gym.settings &&
				gym.startingMembershipCode !== null &&
				gym.settings.biometricPreference === "AUTO"
			) {
				membershipCode = gym.startingMembershipCode + gym.biometricCounter + valid.length;
			}

			if (membershipCode === undefined || membershipCode === null) {
				failed.push({ row: i + 1, reason: "No membership code available" });
				continue;
			}

			valid.push({
				membershipCode,
				data: {
					name: row.EmployeeName,
					gender: row.Gender,
					phone: row.PhoneNumber.toString(),
					emergencyContact: row.EmergencyContact?.toString(),
					email: row.Email,
					dateOfBirth: row.DOB,
					weight: row.Weight,
					height: row.Height,
					planType: row.MembershipPlan,
					membershipAmount: row.MembershipAmount,
					membershipStartDate: row.StartDate,
					dueAmount: 0,
					isMachine: false,
				},
			});
		}

		await this.bulkRepository.BulkUploadMembersExcel(gymId, valid, gym.owner.username);

		if (gym.settings?.biometricPreference === "AUTO" && valid.length > 0) {
			await this.gymRepository.update(gymId, { biometricCounter: valid.length }, false);
		}

		return {
			message: "Bulk upload completed",
			success: true,
			data: { count: valid.length, failed },
		};
	}
	async bulkOnboardMachineMembers(
		gymId: string,
		serialNumber: string,
		user: AuthenticatedUser,
	): Promise<BaseResponse<null>> {
		if (user.gymId !== gymId) {
			throw new GymError(GymErrorCode.FORBIDDEN, "not your gym");
		}
		const payload = await this.machineRepository.getMachineUsers(
			serialNumber,
			env.MACHINE_SERVER_API_KEY,
		);

		const membershipCodes = payload.map((member: { EmployeeCode: any }) =>
			Number(member.EmployeeCode),
		);

		const members = machineFetchedMembers.parse(membershipCodes);
		await this.bulkRepository.BulkUploadMembersMachine(gymId, members, serialNumber);
		return {
			message: "successfully added members",
			success: true,
			data: null,
		};
	}
}
