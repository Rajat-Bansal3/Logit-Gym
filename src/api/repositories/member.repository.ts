import type {
	Member,
	MemberMetrics,
	Membership,
	Prisma,
	PrismaClient,
} from "../../generated/client";
import type {
	ListMembersQuery,
	OnboardMember,
	UpdateMember,
} from "../../shared/types/member.types";
import { computeAge, computeMembershipEndDate } from "../../shared/utils/util_functions";

export type MemberWithDetails = Member & {
	currentMembership: Membership | null;
	memberMetrics: MemberMetrics | null;
};

export type MemberListResult = {
	members: MemberWithDetails[];
	total: number;
	page: number;
	limit: number;
};

const memberWithDetails = {
	currentMembership: true,
	memberMetrics: true,
} satisfies Prisma.MemberInclude;

export class MemberRepository {
	constructor(private readonly prisma: PrismaClient) {}

	async findByPhone(phone: string): Promise<Member | null> {
		return this.prisma.member.findUnique({ where: { phone } });
	}

	async findByEmail(email: string): Promise<Member | null> {
		return this.prisma.member.findUnique({ where: { email } });
	}

	async findByIdAndGym(memberId: string, gymId: string): Promise<MemberWithDetails | null> {
		return this.prisma.member.findFirst({
			where: { id: memberId, gymId },
			include: memberWithDetails,
		});
	}

	async listByGym(gymId: string, query: ListMembersQuery): Promise<MemberListResult> {
		const { status, search, page, limit } = query;
		const skip = (page - 1) * limit;

		const where: Prisma.MemberWhereInput = {
			gymId,
			...(status !== undefined && { status }),
			...(search !== undefined && {
				OR: [
					{ name: { contains: search, mode: "insensitive" } },
					{ phone: { contains: search } },
					{ email: { contains: search, mode: "insensitive" } },
				],
			}),
		};

		const [members, total] = await this.prisma.$transaction([
			this.prisma.member.findMany({
				where,
				skip,
				take: limit,
				orderBy: { createdAt: "desc" },
				include: memberWithDetails,
			}),
			this.prisma.member.count({ where }),
		]);

		return { members, total, page, limit };
	}

	async create(gymId: string, input: OnboardMember): Promise<MemberWithDetails> {
		const endDate = computeMembershipEndDate(input.membershipStartDate, input.planType);

		return this.prisma.$transaction(async (tx) => {
			const member = await tx.member.create({
				data: {
					gymId,
					name: input.name,
					dateOfBirth: input.dateOfBirth,
					address: input.address,
					phone: input.phone,
					gender: input.gender,
					age: computeAge(input.dateOfBirth),
					...(input.email !== undefined && { email: input.email }),
					...(input.emergencyContact !== undefined && {
						emergencyContact: input.emergencyContact,
					}),
					...(input.weight !== undefined && { weight: input.weight }),
					...(input.height !== undefined && { height: input.height }),
					...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
				},
			});

			const membership = await tx.membership.create({
				data: {
					memberId: member.id,
					planType: input.planType,
					startDate: input.membershipStartDate,
					endDate,
					dueAmount: input.dueAmount,
					isActive: true,
					...(input.planName !== undefined && { planName: input.planName }),
				},
			});

			const updated = await tx.member.update({
				where: { id: member.id },
				data: { currentMembershipId: membership.id },
				include: memberWithDetails,
			});

			await tx.memberMetrics.create({
				data: { memberId: member.id },
			});

			return updated;
		});
	}

	async update(memberId: string, input: UpdateMember): Promise<MemberWithDetails> {
		return this.prisma.member.update({
			where: { id: memberId },
			data: {
				...(input.name !== undefined && { name: input.name }),
				...(input.address !== undefined && { address: input.address }),
				...(input.phone !== undefined && { phone: input.phone }),
				...(input.gender !== undefined && { gender: input.gender }),
				...(input.status !== undefined && { status: input.status }),
				...(input.email !== undefined && { email: input.email ?? null }),
				...(input.emergencyContact !== undefined && {
					emergencyContact: input.emergencyContact ?? null,
				}),
				...(input.avatarUrl !== undefined && {
					avatarUrl: input.avatarUrl ?? null,
				}),
				...(input.weight !== undefined && { weight: input.weight ?? null }),
				...(input.height !== undefined && { height: input.height ?? null }),
			},
			include: memberWithDetails,
		});
	}

	async softDelete(memberId: string): Promise<Member> {
		return this.prisma.member.update({
			where: { id: memberId },
			data: { status: "INACTIVE" },
		});
	}
}
