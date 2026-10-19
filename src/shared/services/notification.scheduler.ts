import cron from "node-cron";
import { appLogger } from "../../shared/utils/logger";
import { NotificationService } from "./notification.service";

/**
 * Schedules push-notification jobs. Runs inside the server process so
 * notifications fire even if nobody opens the app.
 *
 * NOTE: The machine→DB attendance sync (scripts/sync_attendance.js) is a
 * separate plain-Node script that can't be required from this TS process
 * (its generated Prisma client has no JS entry). Run it via PM2 cron_restart
 * or system cron — see the note at the bottom of this file.
 *
 * - Attendance batches: every 10 minutes.
 * - Subscription (owner) lifecycle: daily at 09:00.
 * - Membership (member) lifecycle: daily at 09:15.
 */
export function startNotificationScheduler(): void {
    const notifications = new NotificationService();

    cron.schedule("*/10 * * * *", async () => {
        try {
            await notifications.notifyAttendanceBatches();
        } catch (error) {
            appLogger.error("attendance batch notification job failed", { error });
        }
    });

    cron.schedule("0 9 * * *", async () => {
        try {
            await notifications.notifySubscriptionLifecycle();
        } catch (error) {
            appLogger.error("subscription lifecycle job failed", { error });
        }
    });

    cron.schedule("15 9 * * *", async () => {
        try {
            await notifications.notifyMembershipLifecycle();
        } catch (error) {
            appLogger.error("membership lifecycle job failed", { error });
        }
    });

    appLogger.info("Notification scheduler started");
}

/*
 * To run the attendance sync script every 10 minutes under PM2, add a second
 * app entry to ecosystem.config.mjs (PM2 restarts it on the cron schedule,
 * the script runs once to completion, then exits):
 *
 *   {
 *     name: "attendance-sync",
 *     script: "scripts/sync_attendance.js",
 *     cwd: "/path/to/Logit-Gym",
 *     cron_restart: "EVERY_10_MIN",  // i.e. star-slash-10 star star star star
 *     autorestart: false,   // let it exit after each run; cron re-launches it
 *     env: { NODE_ENV: "production" },
 *   }
 *
 * Then: pm2 reload ecosystem.config.mjs && pm2 save
 */
