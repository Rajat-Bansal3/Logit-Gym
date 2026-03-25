import type { PrismaClient } from "../../generated/client";
import { MemberError, MemberErrorCode } from "../../shared/errors/member-errors";
import type { AuthenticatedUser } from "../../shared/types/auth.types";
import type {
	ListMembersQuery,
	OnboardMember,
	UpdateMember,
} from "../../shared/types/member.types";
import type { BaseResponse } from "../../shared/types/returns";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import {
	type MemberListResult,
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
				throw new MemberError(MemberErrorCode.CONFLICT, "A member with this email already exists");
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
		_user: AuthenticatedUser,
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
		_user: AuthenticatedUser,
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
		_user: AuthenticatedUser,
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
		_user: AuthenticatedUser,
	): Promise<BaseResponse<null>> {
		this.logger.debug("deactivateMember: fetching member", { memberId, gymId });

		const member = await this.memberRepository.findByIdAndGym(memberId, gymId);
		if (!member) {
			throw new MemberError(MemberErrorCode.NOT_FOUND);
		}

		if (member.status === "INACTIVE") {
			throw new MemberError(MemberErrorCode.BAD_REQUEST, "Member is already inactive");
		}

		await this.memberRepository.softDelete(memberId);

		this.logger.debug("deactivateMember: success", { memberId });
		return {
			message: "Member deactivated successfully",
			success: true,
			data: null,
		};
	}
}
