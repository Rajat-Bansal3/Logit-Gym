import {
	type AttendanceLog,
	CheckInType,
	type Member,
	type MemberMetrics,
	type MemberStatus,
	type Membership,
	type Payment,
	type Prisma,
	type PrismaClient,
} from "../../generated/client";
import { MemberError, MemberErrorCode } from "../../shared/errors/member-errors";
import {
	days,
	type daysEnumType,
	type ListMembersQuery,
	type OnboardMember,
	type ReportQuery,
	type UpdateMember,
} from "../../shared/types/member.types";
import type { CreateMemberMembershipInput } from "../../shared/types/payment.types";
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
	memberMachines: {
		include: {
			machine: true,
		},
	},
} satisfies Prisma.MemberInclude;

export type GymOverviewReport = {
	totalRevenue: number;
	pendingDues: number;
	activeMembers: number;
	inactiveMembers: number;
	suspendedMembers: number;
	newMembersInRange: number;
};

export type AttendanceReport = {
	totalCheckIns: number;
	totalCheckOuts: number;
	uniqueMembers: number;
	hourlyTraffic: { hour: number; count: number }[];
	weeklyActivity: { day: string; total: number }[];
	dailyBreakdown: { date: string; checkIns: number; checkOuts: number }[];
};

export type MemberMetricsReport = {
	averageAttendancePercentage: number;
	averageStreak: number;
	topAttendees: {
		memberId: string;
		name: string;
		attendancePercentage: number;
		currentStreak: number;
	}[];
	paymentStatusBreakdown: {
		status: string;
		count: number;
	}[];
	churnRisk: {
		memberId: string;
		name: string;
		lastCheckIn: Date | null;
		daysSinceLastCheckIn: number | null;
	}[];
};

export type MemberIncludingUser = Prisma.MemberGetPayload<{
	include: {
		user: true;
	};
}>;

export type MemberDashboardData = Prisma.MemberGetPayload<{
	include: {
		gym: {
			include: {
				gymProfile: true;
			};
		};
		currentMembership: true;
		user: true;
	};
}>;
export type MemberDashboardOut = {
	memberId: string;
	gymId: string;
	name: string;
	plan: string;
	days_left: Date | null;
	due_amount: number;
	activity_graph: number[];
};
export type MemberAttendanceOut = Prisma.AttendanceLogGetPayload<{
	include: {
		member: {
			select: {
				name: true;
			};
		};
	};
}>[];

export class MemberRepository {
	constructor(private readonly prisma: PrismaClient) { }

	async findByPhone(phone: string): Promise<Member | null> {
		return this.prisma.member.findUnique({ where: { phone } });
	}

	async findByEmail(email: string): Promise<Member | null> {
		return this.prisma.member.findUnique({ where: { email } });
	}

	async findByEmailAndGym(email: string, gymId: string): Promise<Member | null> {
		return this.prisma.member.findFirst({ where: { email, gymId } });
	}

	async findByPhoneAndGym(phone: string, gymId: string): Promise<Member | null> {
		return this.prisma.member.findFirst({ where: { phone, gymId } });
	}

	async findByIdAndGym(memberId: string, gymId: string): Promise<MemberWithDetails | null> {
		return this.prisma.member.findFirst({
			where: { id: memberId, gymId },
			include: memberWithDetails,
		});
	}

	async listByGym(gymId: string, query: ListMembersQuery): Promise<MemberListResult> {
		const { status, search, page, limit, isMachine, serialNumber } = query;
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
			...(isMachine === true &&
				serialNumber !== undefined && {
				memberMachines: {
					some: {
						machine: { serialNumber },
					},
				},
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
			if (input.isMachine && input.serialNumbers?.length > 0) {
				const machines = await tx.machines.findMany({
					where: {
						serialNumber: { in: input.serialNumbers },
						gymId,
					},
					select: { id: true },
				});

				await tx.memberMachine.createMany({
					data: machines.map((machine) => ({
						memberId: member.id,
						machineId: machine.id,
					})),
				});
			}
			const membership = await tx.membership.create({
				data: {
					memberId: member.id,
					planType: input.planType,
					startDate: input.membershipStartDate,
					endDate,
					dueAmount: input.dueAmount,
					isActive: true,
					...(input.planName !== undefined && { planName: input.planName }),
					membershipAmount: input.membershipAmount,
				},
			});
			if (input.dueAmount === 0) {
				await tx.payment.create({
					data: {
						amount: input.membershipAmount,
						gymId,
						memberId: member.id,
						membershipId: membership.id,
						category: "Membership",
					},
				});
			}

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
				age: computeAge(input.dateOfBirth),
			},
			include: memberWithDetails,
		});
	}

	async updateStatus(memberId: string, currStatus: MemberStatus): Promise<Member> {
		switch (currStatus) {
			case "ACTIVE":
				return this.prisma.member.update({
					where: { id: memberId },
					data: { status: "INACTIVE" },
				});
			case "INACTIVE":
				return this.prisma.member.update({
					where: { id: memberId },
					data: { status: "ACTIVE" },
				});

			default:
				return this.prisma.member.update({
					where: { id: memberId },
					data: {},
				});
		}
	}
	async delete(memberId: string) {
		await this.prisma.member.update({
			where: {
				id: memberId,
			},
			data: {
				isDeleted: true,
			},
		});
	}

	async markAttendance(
		member: Prisma.MemberGetPayload<{
			include: {
				user: true;
				currentMembership: true;
				gym: {
					include: {
						gymProfile: true;
					};
				};
			};
		}>,
		day: daysEnumType,
	): Promise<AttendanceLog> {
		return this.prisma.$transaction(async (tx) => {
			const log = await tx.attendanceLog.create({
				data: { gymId: member.gymId, memberId: member.id, type: "IN" },
			});

			const mem_metrics = await tx.memberMetrics.findUnique({
				where: { memberId: member.id },
			});
			const { newStreak, alreadyCheckedInToday } = this.getStreakUpdate(
				mem_metrics?.currentStreak ?? 0,
				mem_metrics?.lastCheckIn ?? null,
			);

			await tx.memberMetrics.update({
				where: { memberId: member.id },
				data: {
					lastCheckIn: log.timestamp,
					totalCheckIns: { increment: 1 },
					currentStreak: newStreak,
					lastUpdated: new Date(),
				},
			});

			if (!alreadyCheckedInToday) {
				const aggregate = [...member.attendanceAggregate];
				const dayIndex = days.indexOf(day);
				aggregate[dayIndex] = (aggregate[dayIndex] ?? 0) + 1;
				await tx.member.update({
					where: { id: member.id },
					data: { attendanceAggregate: aggregate },
				});
			}

			return log;
		});
	}

	async getGymOverviewReport(gymId: string, query: ReportQuery): Promise<GymOverviewReport> {
		const { from, to } = query;
		const hasDateFilter = from !== undefined || to !== undefined;
		const dateFilter = {
			...(from !== undefined && { gte: from }),
			...(to !== undefined && { lte: to }),
		};

		const [metrics, statusCounts, newMembers] = await this.prisma.$transaction([
			this.prisma.gymMetrics.findUnique({
				where: { gymId },
			}),
			this.prisma.member.groupBy({
				by: ["status"],
				where: { gymId },
				orderBy: { status: "asc" },
			}),
			this.prisma.member.count({
				where: {
					gymId,
					...(hasDateFilter && { createdAt: dateFilter }),
				},
			}),
		]);

		const statusMap = Object.fromEntries(
			statusCounts.map((s) => [s.status, s.status.length]), //FIX
		);

		return {
			totalRevenue: metrics?.totalRevenue ?? 0,
			pendingDues: metrics?.pendingDues ?? 0,
			activeMembers: statusMap.ACTIVE ?? 0,
			inactiveMembers: statusMap.INACTIVE ?? 0,
			suspendedMembers: statusMap.SUSPENDED ?? 0,
			newMembersInRange: newMembers,
		};
		// return {
		// 	totalRevenue: 0,
		// 	pendingDues: 0,
		// 	growthPercentage: 0,
		// 	activeMembers: 0,
		// 	inactiveMembers: 0,
		// 	suspendedMembers: 0,
		// 	newMembersInRange: 0,
		// };
	}

	async getAttendanceReport(gymId: string, query: ReportQuery): Promise<AttendanceReport> {
		const { from, to } = query;
		const hasDateFilter = from !== undefined || to !== undefined;
		const dateFilter = {
			...(from !== undefined && { gte: from }),
			...(to !== undefined && { lte: to }),
		};

		const [logs, hourlyRows, weeklyRows] = await this.prisma.$transaction([
			this.prisma.attendanceLog.findMany({
				where: {
					gymId,
					...(hasDateFilter && { timestamp: dateFilter }),
				},
				orderBy: { timestamp: "asc" },
			}),
			this.prisma.hourlyTraffic.groupBy({
				by: ["hour"],
				where: {
					gymId,
					...(hasDateFilter && { date: dateFilter }),
				},
				_sum: { count: true },
				orderBy: { hour: "asc" },
			}),
			this.prisma.weeklyActivity.findMany({
				where: {
					gymId,
					...(hasDateFilter && { weekStart: dateFilter }),
				},
			}),
		]);

		const dailyMap = new Map<string, { checkIns: number; checkOuts: number }>();
		for (const log of logs) {
			const day = log.timestamp.toISOString().slice(0, 10);
			const existing = dailyMap.get(day) ?? { checkIns: 0, checkOuts: 0 };
			if (log.type === CheckInType.IN) {
				existing.checkIns++;
			} else {
				existing.checkOuts++;
			}
			dailyMap.set(day, existing);
		}

		return {
			totalCheckIns: logs.filter((l) => l.type === CheckInType.IN).length,
			totalCheckOuts: logs.filter((l) => l.type === CheckInType.OUT).length,
			uniqueMembers: new Set(logs.map((l) => l.memberId)).size,
			hourlyTraffic: hourlyRows.map((r) => ({
				hour: r.hour,
				count: r._sum?.count ?? 0,
			})),
			weeklyActivity: days.map((day) => ({
				day,
				total: weeklyRows.reduce((sum, row) => sum + row[day], 0),
			})),
			dailyBreakdown: Array.from(dailyMap.entries()).map(([date, v]) => ({
				date,
				...v,
			})),
		};
	}

	async getMemberMetricsReport(gymId: string, _query: ReportQuery): Promise<MemberMetricsReport> {
		const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

		const [averages, topAttendees, churnRisk, paymentStatusBreakdown] = await Promise.all([
			this.prisma.memberMetrics.aggregate({
				where: { member: { gymId, status: "ACTIVE" } },
				_avg: {
					attendancePercentage: true,
					currentStreak: true,
				},
			}),

			this.prisma.memberMetrics.findMany({
				where: { member: { gymId, status: "ACTIVE" } },
				orderBy: { attendancePercentage: "desc" },
				take: 10,
				include: {
					member: { select: { id: true, name: true } },
				},
			}),

			this.prisma.memberMetrics.findMany({
				where: {
					member: { gymId, status: "ACTIVE" },
					OR: [{ lastCheckIn: { lt: sevenDaysAgo } }, { lastCheckIn: null }],
				},
				orderBy: { lastCheckIn: "asc" },
				take: 20,
				include: {
					member: { select: { id: true, name: true } },
				},
			}),

			this.prisma.memberMetrics.groupBy({
				by: ["paymentStatus"],
				where: { member: { gymId } },
				_count: { paymentStatus: true },
			}),
		]);

		return {
			averageAttendancePercentage: averages._avg.attendancePercentage ?? 0,
			averageStreak: averages._avg.currentStreak ?? 0,
			topAttendees: topAttendees.map((m) => ({
				memberId: m.member.id,
				name: m.member.name,
				attendancePercentage: m.attendancePercentage,
				currentStreak: m.currentStreak,
			})),
			churnRisk: churnRisk.map((m) => ({
				memberId: m.member.id,
				name: m.member.name,
				lastCheckIn: m.lastCheckIn,
				daysSinceLastCheckIn:
					m.lastCheckIn === null
						? null
						: Math.floor((Date.now() - m.lastCheckIn.getTime()) / 86_400_000),
			})),
			paymentStatusBreakdown: paymentStatusBreakdown.map((r) => ({
				status: r.paymentStatus,
				count: r._count.paymentStatus,
			})),
		};
	}
	async getMemberattendance(memberId: string): Promise<MemberAttendanceOut> {
		return await this.prisma.attendanceLog.findMany({
			where: {
				memberId: memberId,
			},
			include: {
				member: {
					select: {
						name: true,
					},
				},
			},
		});
	}
	async getMemberGym(memberId: string): Promise<Prisma.GymGetPayload<{
		include: {
			gymProfile: true;
		};
	}> | null> {
		const member = await this.prisma.member.findUnique({
			where: {
				id: memberId,
			},
			include: {
				gym: {
					include: {
						gymProfile: true,
					},
				},
			},
		});
		if (!member) {
			return null;
		} else {
			return member.gym;
		}
	}
	async getMemberPayments(userId: string): Promise<Payment[]> {
		return (
			(
				await this.prisma.member.findUnique({
					where: {
						userId: userId,
					},
					include: {
						payments: true,
					},
				})
			)?.payments ?? []
		);
	}
	async profile(memberId: string): Promise<MemberIncludingUser | null> {
		return await this.prisma.member.findUnique({
			where: {
				id: memberId,
			},
			include: {
				user: true,
			},
		});
	}
	async getMemberDashboard(memberId: string): Promise<MemberDashboardData | null> {
		return await this.prisma.member.findUnique({
			where: {
				id: memberId,
			},
			include: {
				user: true,
				currentMembership: true,
				gym: {
					include: {
						gymProfile: true,
					},
				},
			},
		});
	}
	async getGymOccupancy(memberId: string) {
		const now = new Date();
		const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
		const gym = await this.prisma.member.findUnique({
			where: {
				id: memberId,
			},
			select: {
				gymId: true,
			},
		});
		if (!gym) {
			throw new MemberError(MemberErrorCode.NOT_FOUND, " member not found");
		}
		const gymId = gym.gymId;
		return await this.prisma.$transaction([
			this.prisma.member.count({
				where: {
					gymId: gymId,
				},
			}),
			this.prisma.attendanceLog.count({
				where: {
					gymId,
					type: CheckInType.OUT,
					timestamp: { gte: windowStart, lte: now },
				},
			}),
		]);
	}
	async getGymAttendance(gymId: string, date: Date): Promise<MemberAttendanceOut> {
		const startOfDay = new Date(date);
		startOfDay.setUTCHours(0, 0, 0, 0);

		const endOfDay = new Date(date);
		endOfDay.setUTCHours(23, 59, 59, 999);
		return await this.prisma.attendanceLog.findMany({
			where: {
				gymId: gymId,
				createdAt: {
					gte: startOfDay,
					lte: endOfDay,
				},
			},
			include: {
				member: {
					select: {
						name: true,
					},
				},
			},
		});
	}
	async getMemberMembership(memberId: string): Promise<
		Prisma.MembershipGetPayload<{
			include: {
				payments: true;
			};
		}>[]
	> {
		return await this.prisma.membership.findMany({
			where: {
				memberId: memberId,
			},
			include: {
				payments: true,
			},
		});
	}
	async createMemberMembership(memberId: string, data: CreateMemberMembershipInput) {
		const curr_membership = await this.prisma.$transaction(async (tx) => {
			const curr_membership = await tx.membership.create({
				data: {
					memberId: memberId,
					planType: data.planType,
					startDate: data.startDate,
					dueAmount: data.dueAmount,
					endDate: computeMembershipEndDate(data.startDate, data.planType),
					membershipAmount: data.membershipAmount,
				},
				select: {
					id: true,
					endDate: true,
					member: {
						select: {
							gymId: true,
							biometricCode: true,
						},
					},
				},
			});
			await tx.membership.update({
				where: {
					id: data.predecessor,
				},
				data: {
					successorId: curr_membership.id,
				},
			});
			await tx.payment.create({
				data: {
					amount: data.membershipAmount,
					description: "membership payment",
					memberId: memberId,
					gymId: curr_membership.member.gymId,
					category: "Membership",
				},
			});
			return curr_membership;
		});
		return curr_membership;
	}
	getStreakUpdate(
		currentStreak: number,
		lastCheckIn: Date | null,
	): { newStreak: number; alreadyCheckedInToday: boolean } {
		const toLocalMidnight = (date: Date): Date => {
			const parts = new Intl.DateTimeFormat("en-US", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}).formatToParts(date);

			const year = parts.find((p) => p.type === "year")!.value;
			const month = parts.find((p) => p.type === "month")!.value;
			const day = parts.find((p) => p.type === "day")!.value;

			return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
		};

		const now = toLocalMidnight(new Date());

		if (!lastCheckIn) {
			return { newStreak: 1, alreadyCheckedInToday: false };
		}

		const last = toLocalMidnight(lastCheckIn);
		const diff = Math.floor((now.getTime() - last.getTime()) / 86_400_000);

		if (diff === 0) {
			return { newStreak: currentStreak, alreadyCheckedInToday: true };
		}
		if (diff === 1) {
			return { newStreak: currentStreak + 1, alreadyCheckedInToday: false };
		}
		return { newStreak: 1, alreadyCheckedInToday: false };
	}
}
