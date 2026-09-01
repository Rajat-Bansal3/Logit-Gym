import { createId as cuid } from "@paralleldrive/cuid2";
import { type CheckInType, Prisma, type PrismaClient } from "../../generated/client";
import type { ValidMember } from "../../shared/types/gym.types";
import { computeMembershipEndDate } from "../../shared/utils/util_functions";
import { AuthService } from "../services/auth.service";

export type createManyAttendanceType = {
	memberId: string;
	membershipCode: number;
	timestamp: Date;
	gymId: string;
	type: CheckInType;
}[];

export class BulkRepository {
	private client: PrismaClient;
	private authService: AuthService;
	constructor(client: PrismaClient) {
		this.client = client;
		this.authService = new AuthService();
	}

	async syncAttenceWithLogs(data: createManyAttendanceType) {
		await this.client.attendanceLog.createMany({
			data: data,
			skipDuplicates: true,
		});
	}
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
			const endDate = computeMembershipEndDate(m.data.membershipStartDate, m.data.planType);
			return { ...m, username, endDate };
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
            ${m.data.name},
            ${m.username},
            ${m.membershipCode},
            ${m.data.phone ?? null},
            ${m.data.email ?? null},
            ${m.data.dateOfBirth ?? null},
            ${m.data.gender ?? null},
            ${m.data.emergencyContact ?? null},
            ${m.data.weight ?? null},
            ${m.data.height ?? null},
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
            ${m.data.email ?? null},
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

				const insertedMemberships = await tx.$queryRaw<{ id: string; member_id: string }[]>`
      INSERT INTO memberships (
        id, "memberId", "planType", "startDate", "endDate",
        "isActive", "dueAmount", "membershipAmount",
        "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(
				memberRows.map((m, i) => {
					const member = insertedMembers[i];
					return Prisma.sql`(
            ${cuid()},
            ${member!.id},
            ${m.data.planType}::"MembershipPlanType",
            ${m.data.membershipStartDate},
            ${m.endDate},
            true,
            ${m.data.dueAmount},
            ${m.data.membershipAmount},
            ${now},
            ${now}
          )`;
				}),
			)}
      RETURNING id, "memberId"
    `;

				await tx.$queryRaw`
      UPDATE members m
      SET "currentMembershipId" = ms.id
      FROM memberships ms
      WHERE ms."memberId" = m.id
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
            'PAID'::"PaymentStatus",
            ${now},
            ${now},
            ${now}
          )`,
				),
			)}
    `;

				const paidMembers = memberRows
					.map((m, i) => ({
						m,
						membership: insertedMemberships[i],
						member: insertedMembers[i],
					}))
					.filter(({ m }) => m.data.dueAmount === 0);

				if (paidMembers.length > 0) {
					await tx.$queryRaw`
        INSERT INTO payments (
          id, "memberId","type", "membershipId", "gymId",
          amount, category, status, "paidDate",
          "createdAt", "updatedAt"
        )
        VALUES ${Prisma.join(
					paidMembers.map(
						({ m, membership, member }) =>
							Prisma.sql`(
              ${cuid()},
              ${member!.id},
              "CREDIT",
              ${membership!.id},
              ${gymId},
              ${m.data.membershipAmount},
              'Membership',
              'SUCCESS'::"PaymentStatus",
              ${now},
              ${now},
              ${now}
            )`,
					),
				)}
      `;

					const totalRevenue = paidMembers.reduce((sum, { m }) => sum + m.data.membershipAmount, 0);

					await tx.gymMetrics.update({
						where: { gymId },
						data: { totalRevenue: { increment: totalRevenue } },
					});
				}
			},
			{ timeout: 30000, maxWait: 30000 },
		);
	}
	async BulkUploadMembersMachine(_gymId: string, _members: number[], _serialNumber: string) {}
}
