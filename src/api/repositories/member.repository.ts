import type { OnboardMemberInput } from "../../shared/types/member.types";
import type { BaseResponse } from "../../shared/types/returns";
import { client } from "../../shared/utils/prisma";

export class MemberRepository {
	async createMember(data: OnboardMemberInput, gymId: string): Promise<BaseResponse<any>> {
		const member = await client.member.create({
			data: { ...data, gymId: gymId },
		});
		return {
			message: "",
			success: true,
			data: member,
		};
	}
}
