import {
  type AttendanceLog,
  CheckInType,
  Gym,
  type Member,
  type MemberMetrics,
  type Membership,
  Payment,
  type Prisma,
  type PrismaClient,
} from "../../generated/client";
import type {
  ListMembersQuery,
  OnboardMember,
  ReportQuery,
  UpdateMember,
} from "../../shared/types/member.types";
import {
  computeAge,
  computeMembershipEndDate,
} from "../../shared/utils/util_functions";

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

export type GymOverviewReport = {
  totalRevenue: number;
  pendingDues: number;
  growthPercentage: number;
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

export class MemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByPhone(phone: string): Promise<Member | null> {
    return this.prisma.member.findUnique({ where: { phone } });
  }

  async findByEmail(email: string): Promise<Member | null> {
    return this.prisma.member.findUnique({ where: { email } });
  }

  async findByEmailAndGym(
    email: string,
    gymId: string,
  ): Promise<Member | null> {
    return this.prisma.member.findFirst({ where: { email, gymId } });
  }

  async findByPhoneAndGym(
    phone: string,
    gymId: string,
  ): Promise<Member | null> {
    return this.prisma.member.findFirst({ where: { phone, gymId } });
  }

  async findByIdAndGym(
    memberId: string,
    gymId: string,
  ): Promise<MemberWithDetails | null> {
    return this.prisma.member.findFirst({
      where: { id: memberId, gymId },
      include: memberWithDetails,
    });
  }

  async listByGym(
    gymId: string,
    query: ListMembersQuery,
  ): Promise<MemberListResult> {
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

  async create(
    gymId: string,
    input: OnboardMember,
  ): Promise<MemberWithDetails> {
    const endDate = computeMembershipEndDate(
      input.membershipStartDate,
      input.planType,
    );

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

  async update(
    memberId: string,
    input: UpdateMember,
  ): Promise<MemberWithDetails> {
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

  async markAttendance(
    gymId: string,
    memberId: string,
    type: CheckInType,
  ): Promise<AttendanceLog> {
    return this.prisma.$transaction(async (tx) => {
      const log = await tx.attendanceLog.create({
        data: { memberId, gymId, type },
      });

      if (type === CheckInType.IN) {
        await tx.memberMetrics.update({
          where: { memberId },
          data: {
            lastCheckIn: log.timestamp,
            totalCheckIns: { increment: 1 },
            lastUpdated: new Date(),
          },
        });
      }

      return log;
    });
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  async getGymOverviewReport(
    gymId: string,
    query: ReportQuery,
  ): Promise<GymOverviewReport> {
    console.log(gymId, query);
    // const { from, to } = query;
    // const hasDateFilter = from !== undefined || to !== undefined;
    // const dateFilter = {
    //   ...(from !== undefined && { gte: from }),
    //   ...(to !== undefined && { lte: to }),
    // };

    // const [metrics, statusCounts, newMembers] = await this.prisma.$transaction([
    //   this.prisma.gymMetrics.findUnique({
    //     where: { gymId },
    //   }),
    //   this.prisma.member.groupBy({
    //     by: ["status"],
    //     where: { gymId },
    //     _count: { _all: true },
    //     orderBy: { status: "asc" },
    //   }),
    //   this.prisma.member.count({
    //     where: {
    //       gymId,
    //       ...(hasDateFilter && { createdAt: dateFilter }),
    //     },
    //   }),
    // ]);

    // const statusMap = Object.fromEntries(
    //   statusCounts.map((s) => [s.status, s._count!._all]), //FIX
    // );

    // return {
    //   totalRevenue: metrics?.totalRevenue ?? 0,
    //   pendingDues: metrics?.pendingDues ?? 0,
    //   growthPercentage: metrics?.growthPercentage ?? 0,
    //   activeMembers: statusMap["ACTIVE"] ?? 0,
    //   inactiveMembers: statusMap["INACTIVE"] ?? 0,
    //   suspendedMembers: statusMap["SUSPENDED"] ?? 0,
    //   newMembersInRange: newMembers,
    // };
    return {
      totalRevenue: 0,
      pendingDues: 0,
      growthPercentage: 0,
      activeMembers: 0,
      inactiveMembers: 0,
      suspendedMembers: 0,
      newMembersInRange: 0,
    };
  }

  async getAttendanceReport(
    gymId: string,
    query: ReportQuery,
  ): Promise<AttendanceReport> {
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
      if (log.type === CheckInType.IN) existing.checkIns++;
      else existing.checkOuts++;
      dailyMap.set(day, existing);
    }

    const dayKeys = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ] as const;

    return {
      totalCheckIns: logs.filter((l) => l.type === CheckInType.IN).length,
      totalCheckOuts: logs.filter((l) => l.type === CheckInType.OUT).length,
      uniqueMembers: new Set(logs.map((l) => l.memberId)).size,
      hourlyTraffic: hourlyRows.map((r) => ({
        hour: r.hour,
        count: r._sum?.count ?? 0,
      })),
      weeklyActivity: dayKeys.map((day) => ({
        day,
        total: weeklyRows.reduce((sum, row) => sum + row[day], 0),
      })),
      dailyBreakdown: Array.from(dailyMap.entries()).map(([date, v]) => ({
        date,
        ...v,
      })),
    };
  }

  async getMemberMetricsReport(
    gymId: string,
    _query: ReportQuery,
  ): Promise<MemberMetricsReport> {
    const members = await this.prisma.member.findMany({
      where: { gymId, status: "ACTIVE" },
      include: { memberMetrics: true },
    });

    const withMetrics = members.filter((m) => m.memberMetrics !== null);

    const avg = (nums: number[]) =>
      nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;

    const topAttendees = [...withMetrics]
      .sort(
        (a, b) =>
          b.memberMetrics!.attendancePercentage -
          a.memberMetrics!.attendancePercentage,
      )
      .slice(0, 10)
      .map((m) => ({
        memberId: m.id,
        name: m.name,
        attendancePercentage: m.memberMetrics!.attendancePercentage,
        currentStreak: m.memberMetrics!.currentStreak,
      }));

    const paymentStatusBreakdown = await this.prisma.memberMetrics
      .groupBy({
        by: ["paymentStatus"],
        where: { member: { gymId } },
        _count: { paymentStatus: true },
      })
      .then((rows) =>
        rows.map((r) => ({
          status: r.paymentStatus,
          count: r._count.paymentStatus,
        })),
      );

    const now = new Date();
    const churnRisk = withMetrics
      .map((m) => {
        const lastCheckIn = m.memberMetrics!.lastCheckIn;
        const daysSinceLastCheckIn =
          lastCheckIn === null
            ? null
            : Math.floor((now.getTime() - lastCheckIn.getTime()) / 86_400_000);
        return {
          memberId: m.id,
          name: m.name,
          lastCheckIn,
          daysSinceLastCheckIn,
        };
      })
      .filter(
        (m) => m.daysSinceLastCheckIn === null || m.daysSinceLastCheckIn > 7,
      )
      .sort(
        (a, b) =>
          (b.daysSinceLastCheckIn ?? Infinity) -
          (a.daysSinceLastCheckIn ?? Infinity),
      )
      .slice(0, 20);

    return {
      averageAttendancePercentage: avg(
        withMetrics.map((m) => m.memberMetrics!.attendancePercentage),
      ),
      averageStreak: avg(
        withMetrics.map((m) => m.memberMetrics!.currentStreak),
      ),
      topAttendees,
      paymentStatusBreakdown,
      churnRisk,
    };
  }
  async getMemberAttendace(userId: string): Promise<AttendanceLog[]> {
    return (
      (
        await this.prisma.member.findUnique({
          where: {
            userId: userId,
          },
          include: {
            attendanceLogs: true,
          },
        })
      )?.attendanceLogs ?? []
    );
  }
  async getMemberGym(userId: string): Promise<Gym | null> {
    let member = await this.prisma.member.findUnique({
      where: {
        userId: userId,
      },
      include: {
        gym: true,
      },
    });
    if (!member) return null;
    else return member.gym;
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
  async profile(userId: string): Promise<MemberIncludingUser | null> {
    return await this.prisma.member.findUnique({
      where: {
        userId: userId,
      },
      include: {
        user: true,
      },
    });
  }
  async getMemberDashboard(
    userId: string,
  ): Promise<MemberIncludingUser | null> {
    return await this.prisma.member.findUnique({
      where: {
        userId: userId,
      },
      include: {
        user: true,
      },
    });
  }
}
