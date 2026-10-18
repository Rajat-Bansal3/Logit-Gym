import * as admin from "firebase-admin";
import type { App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../../env";
import { appLogger } from "../../shared/utils/logger";

/**
 * Thin wrapper around Firebase Cloud Messaging. Initialised lazily and only
 * when credentials are configured, so the server runs fine without Firebase.
 */
class FcmService {
    private app: App | null = null;
    private initialised = false;

    private ensureInitialised(): boolean {
        if (this.initialised) return this.app !== null;
        this.initialised = true;

        const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
        if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
            appLogger.warn("FCM credentials not configured — push notifications disabled");
            return false;
        }

        try {
            this.app = admin.initializeApp({
                credential: admin.cert({
                    projectId: FIREBASE_PROJECT_ID,
                    clientEmail: FIREBASE_CLIENT_EMAIL,
                    // Env vars store the key with escaped newlines.
                    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
                }),
            });
            appLogger.info("Firebase Admin initialised");
            return true;
        } catch (error) {
            appLogger.error("Failed to initialise Firebase Admin", { error });
            this.app = null;
            return false;
        }
    }

    /**
     * Send a push notification to a set of device tokens.
     * Returns the tokens that failed so callers can prune them.
     */
    async sendToTokens({
        tokens,
        title,
        body,
        data,
    }: {
        tokens: string[];
        title: string;
        body: string;
        data?: Record<string, string>;
    }): Promise<{ sent: number; failedTokens: string[] }> {
        if (!this.ensureInitialised() || tokens.length === 0) {
            return { sent: 0, failedTokens: [] };
        }

        const failedTokens: string[] = [];
        let sent = 0;

        // Chunk into batches of 500 (FCM limit for multicast).
        const chunkSize = 500;
        for (let i = 0; i < tokens.length; i += chunkSize) {
            const chunk = tokens.slice(i, i + chunkSize);
            try {
                const messaging = this.app ? getMessaging(this.app) : getMessaging();
                const response = await messaging.sendEachForMulticast({
                    tokens: chunk,
                    notification: { title, body },
                    ...(data ? { data } : {}),
                    apns: { payload: { aps: { sound: "default" } } },
                    android: { priority: "high" },
                });
                sent += response.successCount;
                response.responses.forEach((r: any, idx: number) => {
                    if (!r.success) {
                        const code = r.error?.code ?? "";
                        // Prune tokens that are permanently invalid.
                        if (
                            code.includes("registration-token-not-registered") ||
                            code.includes("invalid-registration-token") ||
                            code.includes("invalid-argument")
                        ) {
                            const badToken = chunk[idx];
                            if (badToken) failedTokens.push(badToken);
                        }
                    }
                });
            } catch (error) {
                appLogger.error("FCM multicast send failed", { error });
            }
        }

        return { sent, failedTokens };
    }
}

export const fcmService = new FcmService();
