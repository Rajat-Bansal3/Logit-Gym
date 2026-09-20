import { createId as cuid } from "@paralleldrive/cuid2";
import { type CheckInType, Prisma, type PrismaClient } from "../../generated/client";
import type { ValidMember } from "../../shared/types/gym.types";
import { days } from "../../shared/types/member.types";
import { computeStreakUpdate, getDayName, getWeekStart } from "../../shared/utils/util_functions";
import { AuthService } from "../services/auth.service";

export type createManyAttendanceType = {
	memberId: string;
	membershipCode: number;
	timestamp: Date;
	gymId: string;
	type: CheckInType;
}[];

type AttendanceLogInput = createManyAttendanceType[number];

export class BulkRepository {
	private client: PrismaClient;
	private authService: AuthService;
	constructor(client: PrismaClient) {
		this.client = client;
		this.authService = new AuthService();
	}

	/**
	 * Inserts only attendance logs that don't already exist (by membershipCode +
	 * gymId + timestamp) and rolls their effect into the same metrics
	 * (memberMetrics, attendanceAggregate, weeklyActivity, hourlyTraffic) that a
	 * live check-in updates. Safe to call repeatedly with overlapping data -
	 * re-synced logs are skipped and never double-count metrics.
	 * gymMetrics.currentOccupancy is intentionally not touched here - it's
	 * fully recomputed from attendance_logs by the decay-occupancy cron.
	 * Returns the number of logs that were newly recorded.
	 */
	async syncAttenceWithLogs(data: createManyAttendanceType): Promise<number> {
		if (data.length === 0) {
			return 0;
		}

		const existing = await this.client.attendanceLog.findMany({
			where: {
				OR: data.map((log) => ({
					membershipCode: log.membershipCode,
					gymId: log.gymId,
					timestamp: log.timestamp,
				})),
			},
			select: { membershipCode: true, gymId: true, timestamp: true },
		});

		const existingKeys = new Set(
			existing.map((log) => this.attendanceKey(log.membershipCode, log.gymId, log.timestamp)),
		);

		const newLogs = data.filter(
			(log) => !existingKeys.has(this.attendanceKey(log.membershipCode, log.gymId, log.timestamp)),
		);

		if (newLogs.length === 0) {
			return 0;
		}

		await this.client.$transaction(
			async (tx) => {
				await tx.attendanceLog.createMany({ data: newLogs, skipDuplicates: true });
				await this.applyAttendanceMetrics(tx, newLogs);
			},
			{ timeout: 30000, maxWait: 30000 },
		);

		return newLogs.length;
	}

	private attendanceKey(membershipCode: number, gymId: string, timestamp: Date): string {
		return `${membershipCode}|${gymId}|${timestamp.getTime()}`;
	}

	private async applyAttendanceMetrics(
		tx: Prisma.TransactionClient,
		logs: AttendanceLogInput[],
	): Promise<void> {
		const memberIds = [...new Set(logs.map((log) => log.memberId))];

		const [members, metricsRows] = await Promise.all([
			tx.member.findMany({
				where: { id: { in: memberIds } },
				select: { id: true, gymId: true, joinDate: true, attendanceAggregate: true },
			}),
			tx.memberMetrics.findMany({ where: { memberId: { in: memberIds } } }),
		]);

		const memberMap = new Map(members.map((m) => [m.id, m]));
		const metricsMap = new Map(metricsRows.map((m) => [m.memberId, m]));

		const logsByMember = new Map<string, AttendanceLogInput[]>();
		for (const log of logs) {
			const list = logsByMember.get(log.memberId) ?? [];
			list.push(log);
			logsByMember.set(log.memberId, list);
		}

		const hourlyIncrements = new Map<
			string,
			{ gymId: string; date: Date; hour: number; count: number }
		>();

		for (const [memberId, memberLogs] of logsByMember) {
			const member = memberMap.get(memberId);
			if (!member) {
				continue;
			}

			const sortedLogs = [...memberLogs].sort(
				(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
			);
			const metrics = metricsMap.get(memberId);

			let streak = metrics?.currentStreak ?? 0;
			let lastCheckIn = metrics?.lastCheckIn ?? null;
			let totalCheckIns = metrics?.totalCheckIns ?? 0;
			const aggregate = [...member.attendanceAggregate];
			const weeklyIncrements = new Map<string, number>();

			for (const log of sortedLogs) {
				const { newStreak, alreadyCheckedInToday } = computeStreakUpdate(
					streak,
					lastCheckIn,
					log.timestamp,
				);
				streak = newStreak;
				lastCheckIn = log.timestamp;

				if (!alreadyCheckedInToday) {
					totalCheckIns += 1;
					const dayName = getDayName(log.timestamp);
					const dayIndex = days.indexOf(dayName);
					aggregate[dayIndex] = (aggregate[dayIndex] ?? 0) + 1;

					const weekStart = getWeekStart(log.timestamp);
					const weekKey = `${weekStart.toISOString()}|${dayName}`;
					weeklyIncrements.set(weekKey, (weeklyIncrements.get(weekKey) ?? 0) + 1);
				}

				const dateOnly = new Date(
					Date.UTC(
						log.timestamp.getUTCFullYear(),
						log.timestamp.getUTCMonth(),
						log.timestamp.getUTCDate(),
					),
				);
				const hour = log.timestamp.getUTCHours();
				const hourKey = `${member.gymId}|${dateOnly.toISOString()}|${hour}`;
				const hourEntry = hourlyIncrements.get(hourKey) ?? {
					gymId: member.gymId,
					date: dateOnly,
					hour,
					count: 0,
				};
				hourEntry.count += 1;
				hourlyIncrements.set(hourKey, hourEntry);
			}

			const daysSinceJoin = Math.max(
				1,
				Math.ceil((lastCheckIn!.getTime() - member.joinDate.getTime()) / 86_400_000),
			);
			const attendancePercentage = Math.min(100, (totalCheckIns / daysSinceJoin) * 100);

			await tx.memberMetrics.upsert({
				where: { memberId },
				create: {
					memberId,
					lastCheckIn,
					totalCheckIns,
					currentStreak: streak,
					attendancePercentage,
					lastUpdated: new Date(),
				},
				update: {
					lastCheckIn,
					totalCheckIns,
					currentStreak: streak,
					attendancePercentage,
					lastUpdated: new Date(),
				},
			});

			await tx.member.update({
				where: { id: memberId },
				data: { attendanceAggregate: aggregate },
			});

			for (const [weekKey, increment] of weeklyIncrements) {
				const [weekStartIso, dayName] = weekKey.split("|") as [string, (typeof days)[number]];
				const weekStart = new Date(weekStartIso);

				await tx.weeklyActivity.upsert({
					where: { memberId_weekStart: { memberId, weekStart } },
					create: {
						memberId,
						gymId: member.gymId,
						weekStart,
						[dayName]: increment,
					} as Prisma.WeeklyActivityUncheckedCreateInput,
					update: { [dayName]: { increment } } as Prisma.WeeklyActivityUpdateInput,
				});
			}
		}

		for (const entry of hourlyIncrements.values()) {
			await tx.hourlyTraffic.upsert({
				where: { gymId_date_hour: { gymId: entry.gymId, date: entry.date, hour: entry.hour } },
				create: { gymId: entry.gymId, date: entry.date, hour: entry.hour, count: entry.count },
				update: { count: { increment: entry.count } },
			});
		}
	}
	// async BulkUploadMembersExcel(
	// 	gymId: string,
	// 	members: ValidMember[],
	// 	gym_username: string,
	// ): Promise<void> {
	// 	if (members.length === 0) {
	// 		return;
	// 	}
	// 	const now = new Date();

	// 	const memberRows = members.map((m) => {
	// 		const username = `${gym_username}_${m.membershipCode}`
	// 			.trim()
	// 			.toLowerCase()
	// 			.replace(/\s+/g, "_");
	// 		const endDate = computeMembershipEndDate(m.data.membershipStartDate, m.data.planType);
	// 		return { ...m, username, endDate };
	// 	});

	// 	await this.client.$transaction(
	// 		async (tx) => {
	// 			const insertedMembers = await tx.$queryRaw<{ id: string; username: string }[]>`
	//     INSERT INTO members (
	//       id, "gymId", name, username, "membershipCode",
	//       phone, email, "dateOfBirth", gender,
	//       "emergencyContact", weight, height,
	//       status, "isDeleted", "attendanceAggregate",
	//       "joinDate", "createdAt", "updatedAt"
	//     )
	//     VALUES ${Prisma.join(
	// 			memberRows.map(
	// 				(m) =>
	// 					Prisma.sql`(
	//           ${cuid()},
	//           ${gymId},
	//           ${m.data.name},
	//           ${m.username},
	//           ${m.membershipCode},
	//           ${m.data.phone ?? null},
	//           ${m.data.email ?? null},
	//           ${m.data.dateOfBirth ?? null},
	//           ${m.data.gender ?? null},
	//           ${m.data.emergencyContact ?? null},
	//           ${m.data.weight ?? null},
	//           ${m.data.height ?? null},
	//           'ACTIVE'::"MemberStatus",
	//           false,
	//           '{0,0,0,0,0,0,0}',
	//           ${now},
	//           ${now},
	//           ${now}
	//         )`,
	// 			),
	// 		)}
	//     RETURNING id, username
	//   `;

	// 			const hashedPasswords = await Promise.all(
	// 				memberRows.map((m) => this.authService.hashPassword(`${m.membershipCode}`.trim())),
	// 			);

	// 			await tx.$queryRaw`
	//     INSERT INTO users (
	//       id, username, email, password, role, "createdAt", "updatedAt"
	//     )
	//     VALUES ${Prisma.join(
	// 			memberRows.map(
	// 				(m, i) =>
	// 					Prisma.sql`(
	//           ${cuid()},
	//           ${m.username},
	//           ${m.data.email ?? null},
	//           ${hashedPasswords[i]},
	//           'MEMBER'::"UserRole",
	//           ${now},
	//           ${now}
	//         )`,
	// 			),
	// 		)}
	//   `;

	// 			await tx.$queryRaw`
	//     UPDATE members m
	//     SET "userId" = u.id
	//     FROM users u
	//     WHERE u.username = m.username
	//     AND m."gymId" = ${gymId}
	//   `;

	// 			const insertedMemberships = await tx.$queryRaw<{ id: string; member_id: string }[]>`
	//     INSERT INTO memberships (
	//       id, "memberId", "planType", "startDate", "endDate",
	//       "isActive", "dueAmount", "membershipAmount",
	//       "createdAt", "updatedAt"
	//     )
	//     VALUES ${Prisma.join(
	// 			memberRows.map((m, i) => {
	// 				const member = insertedMembers[i];
	// 				return Prisma.sql`(
	//           ${cuid()},
	//           ${member!.id},
	//           ${m.data.planType}::"MembershipPlanType",
	//           ${m.data.membershipStartDate},
	//           ${m.endDate},
	//           true,
	//           ${m.data.dueAmount},
	//           ${m.data.membershipAmount},
	//           ${now},
	//           ${now}
	//         )`;
	// 			}),
	// 		)}
	//     RETURNING id, "memberId"
	//   `;

	// 			await tx.$queryRaw`
	//     UPDATE members m
	//     SET "currentMembershipId" = ms.id
	//     FROM memberships ms
	//     WHERE ms."memberId" = m.id
	//     AND m."gymId" = ${gymId}
	//   `;

	// 			await tx.$queryRaw`
	//     INSERT INTO member_metrics (
	//       id, "memberId", "attendancePercentage", "currentStreak",
	//       "totalCheckIns", "paymentStatus", "lastUpdated", "createdAt", "updatedAt"
	//     )
	//     VALUES ${Prisma.join(
	// 			insertedMembers.map(
	// 				(m) =>
	// 					Prisma.sql`(
	//           ${cuid()},
	//           ${m.id},
	//           0, 0, 0,
	//           'PAID'::"PaymentStatus",
	//           ${now},
	//           ${now},
	//           ${now}
	//         )`,
	// 			),
	// 		)}
	//   `;

	// 			const paidMembers = memberRows
	// 				.map((m, i) => ({
	// 					m,
	// 					membership: insertedMemberships[i],
	// 					member: insertedMembers[i],
	// 				}))
	// 				.filter(({ m }) => m.data.dueAmount === 0);

	// 			if (paidMembers.length > 0) {
	// 				await tx.$queryRaw`
	//       INSERT INTO payments (
	//         id, "memberId","type", "membershipId", "gymId",
	//         amount, category, status, "paidDate",
	//         "createdAt", "updatedAt"
	//       )
	//       VALUES ${Prisma.join(
	// 				paidMembers.map(
	// 					({ m, membership, member }) =>
	// 						Prisma.sql`(
	//             ${cuid()},
	//             ${member!.id},
	//             'CREDIT'::"TransactionType",
	//             ${membership!.id},
	//             ${gymId},
	//             ${m.data.membershipAmount},
	//             'Membership',
	//             'SUCCESS'::"PaymentStatus",
	//             ${now},
	//             ${now},
	//             ${now}
	//           )`,
	// 				),
	// 			)}
	//     `;

	// 				const totalRevenue = paidMembers.reduce((sum, { m }) => sum + m.data.membershipAmount, 0);

	// 				await tx.gymMetrics.update({
	// 					where: { gymId },
	// 					data: { totalRevenue: { increment: totalRevenue } },
	// 				});
	// 			}
	// 		},
	// 		{ timeout: 30000, maxWait: 30000 },
	// 	);
	// }

	async BulkUploadMembersExcel(
		gymId: string,
		members: ValidMember[],
		gym_username: string,
	): Promise<void> {
		if (members.length === 0) {
			return;
		}

		const now = new Date();

		const memberRows = members.map((m) => {
			const username = `${gym_username}_${m.membershipCode}`
				.trim()
				.toLowerCase()
				.replace(/\s+/g, "_");

			return { ...m, username };
		});

		await this.client.$transaction(
			async (tx) => {
				const insertedMembers = await tx.$queryRaw<{ id: string; username: string }[]>`
        INSERT INTO members (
          id, "gymId", name, username, "membershipCode",
          phone, email, "dateOfBirth", gender,
          "emergencyContact", weight, height,
          status, "isDeleted", "attendanceAggregate",
          "joinDate", "createdAt", "updatedAt"
        )
        VALUES ${Prisma.join(
					memberRows.map(
						(m) =>
							Prisma.sql`(
                ${cuid()},
                ${gymId},
                ${m.data.EmployeeName ?? null},
                ${m.username},
                ${m.membershipCode},
                ${m.data.PhoneNumber?.toString() ?? null},
                ${m.data.Email ?? null},
                ${m.data.DOB ?? null},
                ${m.data.Gender ?? null},
                ${m.data.EmergencyContact?.toString() ?? null},
                ${m.data.Weight ?? null},
                ${m.data.Height ?? null},
                'ACTIVE'::"MemberStatus",
                false,
                '{0,0,0,0,0,0,0}',
                ${now},
                ${now},
                ${now}
              )`,
					),
				)}
        RETURNING id, username
      `;

				const hashedPasswords = await Promise.all(
					memberRows.map((m) => this.authService.hashPassword(`${m.membershipCode}`.trim())),
				);

				await tx.$queryRaw`
        INSERT INTO users (
          id, username, email, password, role, "createdAt", "updatedAt"
        )
        VALUES ${Prisma.join(
					memberRows.map(
						(m, i) =>
							Prisma.sql`(
                ${cuid()},
                ${m.username},
                ${m.data.Email ?? null},
                ${hashedPasswords[i]},
                'MEMBER'::"UserRole",
                ${now},
                ${now}
              )`,
					),
				)}
      `;

				await tx.$queryRaw`
        UPDATE members m
        SET "userId" = u.id
        FROM users u
        WHERE u.username = m.username
        AND m."gymId" = ${gymId}
      `;

				await tx.$queryRaw`
        INSERT INTO member_metrics (
          id, "memberId", "attendancePercentage", "currentStreak",
          "totalCheckIns", "paymentStatus", "lastUpdated", "createdAt", "updatedAt"
        )
        VALUES ${Prisma.join(
					insertedMembers.map(
						(m) =>
							Prisma.sql`(
                ${cuid()},
                ${m.id},
                0, 0, 0,
                'PENDING'::"PaymentStatus",
                ${now},
                ${now},
                ${now}
              )`,
					),
				)}
      `;
			},
			{ timeout: 30000, maxWait: 30000 },
		);
	}

	async BulkUploadMembersMachine(_gymId: string, _members: number[], _serialNumber: string) { }
}
