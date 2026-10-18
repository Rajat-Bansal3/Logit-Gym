import cron from "node-cron";
import { appLogger } from "../../shared/utils/logger";
import { NotificationService } from "./notification.service";

/**
 * Schedules push-notification jobs. Runs inside the server process so
 * notifications fire even if nobody opens the app.
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
