import type { PrismaClient } from "../../generated/client";
import { fcmService } from "../../shared/services/fcm.service";
import { appLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export class NotificationService {
    constructor(private readonly prisma: PrismaClient = client) { }

    // ── Public entry points ──────────────────────────────────────────────────

    /** Daily job: notify owners whose subscription is expiring (7/3/1 days) or expired. */
    async notifySubscriptionLifecycle(): Promise<void> {
        const gyms = await this.prisma.gym.findMany({
            where: {
                isDeleted: false,
                currentSubscription: { isNot: null },
            },
            select: {
                id: true,
                name: true,
                ownerId: true,
                currentSubscription: {
                    select: { currentPeriodEnd: true, status: true },
                },
            },
        });

        for (const gym of gyms) {
            const sub = gym.currentSubscription;
            if (!sub) continue;

            const daysLeft = Math.ceil(
                (sub.currentPeriodEnd.getTime() - Date.now()) / DAY_MS,
            );

            if (daysLeft < 0) {
                await this._sendOwnerOnce(gym.ownerId, {
                    type: "subscription_expired",
                    targetKey: `${gym.id}:${sub.currentPeriodEnd.toISOString().slice(0, 10)}`,
                    title: "Subscription expired",
                    body: `Your Synapse plan for ${gym.name} has expired. Renew it from the web dashboard to keep everything running.`,
                });
            } else if ([7, 3, 1, 0].includes(daysLeft)) {
                const label =
                    daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
                await this._sendOwnerOnce(gym.ownerId, {
                    type: `subscription_expiring_${daysLeft}`,
                    targetKey: `${gym.id}:${sub.currentPeriodEnd.toISOString().slice(0, 10)}`,
                    title: "Subscription expiring soon",
                    body: `Your Synapse plan for ${gym.name} expires ${label}. Renew it from the web dashboard.`,
                });
            }
        }
    }

    /** Daily job: notify members whose membership is expiring (7/3/1 days) or expired. */
    async notifyMembershipLifecycle(): Promise<void> {
        const members = await this.prisma.member.findMany({
            where: {
                isDeleted: false,
                userId: { not: null },
                currentMembership: { isNot: null },
            },
            select: {
                id: true,
                name: true,
                userId: true,
                gym: { select: { name: true } },
                currentMembership: { select: { endDate: true } },
            },
        });

        for (const member of members) {
            const membership = member.currentMembership;
            if (!membership?.endDate || !member.userId) continue;

            const daysLeft = Math.ceil(
                (membership.endDate.getTime() - Date.now()) / DAY_MS,
            );

            if (daysLeft < 0) {
                await this._sendUserOnce(member.userId, {
                    type: "membership_expired",
                    targetKey: `${member.id}:${membership.endDate.toISOString().slice(0, 10)}`,
                    title: "Membership expired",
                    body: `Your ${member.gym.name} membership has expired. Ask the front desk to renew it.`,
                });
            } else if ([7, 3, 1, 0].includes(daysLeft)) {
                const label =
                    daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
                await this._sendUserOnce(member.userId, {
                    type: `membership_expiring_${daysLeft}`,
                    targetKey: `${member.id}:${membership.endDate.toISOString().slice(0, 10)}`,
                    title: "Membership expiring soon",
                    body: `Your ${member.gym.name} membership expires ${label}. Renew in time to keep your access.`,
                });
            }
        }
    }

    /**
     * Frequent job (every ~10 min): batch today's attendance check-ins per gym
     * and notify the owner, e.g. "Ravi and 4 others just checked in".
     */
    async notifyAttendanceBatches(): Promise<void> {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);

        // Check-ins today that we have not notified about yet.
        const logs = await this.prisma.attendanceLog.findMany({
            where: {
                type: "IN",
                timestamp: { gte: dayStart },
            },
            select: {
                id: true,
                gymId: true,
                timestamp: true,
                member: { select: { name: true } },
                gym: { select: { ownerId: true } },
            },
            orderBy: { timestamp: "asc" },
        });

        if (logs.length === 0) return;

        // Group by gym.
        const byGym = new Map<string, typeof logs>();
        for (const log of logs) {
            const list = byGym.get(log.gymId) ?? [];
            list.push(log);
            byGym.set(log.gymId, list);
        }

        for (const [gymId, gymLogs] of byGym) {
            const ownerId = gymLogs[0]?.gym.ownerId;
            if (!ownerId) continue;

            // Skip check-ins we already notified about (dedup via NotificationLog).
            const fresh: typeof gymLogs = [];
            for (const log of gymLogs) {
                const alreadySent = await this.prisma.notificationLog.findUnique({
                    where: {
                        type_targetKey: { type: "attendance_item", targetKey: log.id },
                    },
                    select: { id: true },
                });
                if (!alreadySent) fresh.push(log);
            }
            if (fresh.length === 0) continue;

            const firstName = fresh[0]?.member?.name ?? "A member";
            const others = fresh.length - 1;
            const body =
                others > 0
                    ? `${firstName} and ${others} other${others === 1 ? "" : "s"} checked in.`
                    : `${firstName} just checked in.`;

            // One batched notification per gym per run.
            await this._sendOwnerOnce(ownerId, {
                type: "attendance_batch",
                targetKey: `${gymId}:${fresh[fresh.length - 1]!.id}`,
                title: "Member check-ins",
                body,
            });

            // Mark every included check-in as notified (idempotent).
            for (const log of fresh) {
                await this._record({
                    type: "attendance_item",
                    targetKey: log.id,
                    title: "Member check-ins",
                    body,
                });
            }
        }
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private async _sendOwnerOnce(
        ownerUserId: string,
        note: { type: string; targetKey: string; title: string; body: string },
    ): Promise<void> {
        await this._sendUserOnce(ownerUserId, note);
    }

    private async _sendUserOnce(
        userId: string,
        note: { type: string; targetKey: string; title: string; body: string },
    ): Promise<void> {
        // Dedup: skip if we already logged this notification.
        const exists = await this.prisma.notificationLog.findUnique({
            where: { type_targetKey: { type: note.type, targetKey: note.targetKey } },
            select: { id: true },
        });
        if (exists) return;

        const tokens = await this.prisma.deviceToken.findMany({
            where: { userId },
            select: { token: true },
        });
        if (tokens.length === 0) return;

        const result = await fcmService.sendToTokens({
            tokens: tokens.map((t: { token: string }) => t.token),
            title: note.title,
            body: note.body,
            data: { type: note.type },
        });

        // Prune dead tokens.
        if (result.failedTokens.length > 0) {
            await this.prisma.deviceToken.deleteMany({
                where: { token: { in: result.failedTokens } },
            });
        }

        if (result.sent > 0) {
            await this._record(note);
            appLogger.info("Push notification sent", {
                type: note.type,
                userId,
                sent: result.sent,
            });
        }
    }

    private async _record(note: {
        type: string;
        targetKey: string;
        title: string;
        body: string;
    }): Promise<void> {
        try {
            await this.prisma.notificationLog.create({
                data: {
                    type: note.type,
                    targetKey: note.targetKey,
                    title: note.title,
                    body: note.body,
                },
            });
        } catch {
            // Unique-constraint race = another worker recorded it first. Safe to ignore.
        }
    }
}
