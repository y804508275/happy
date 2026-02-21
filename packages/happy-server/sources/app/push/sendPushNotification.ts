import { db } from "@/storage/db";
import { log } from "@/utils/log";
import axios from "axios";

/**
 * Sends push notifications to all registered devices for a given account.
 * Uses the Expo Push Notification API (https://docs.expo.dev/push-notifications/sending-notifications/).
 *
 * @param accountId - The account to send notifications to
 * @param title - Notification title
 * @param body - Notification body text
 * @param data - Optional data payload for the notification
 */
export async function sendPushNotification(
    accountId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
): Promise<void> {
    try {
        // Fetch all push tokens for this account
        const tokens = await db.accountPushToken.findMany({
            where: { accountId },
            select: { token: true }
        });

        if (tokens.length === 0) {
            return;
        }

        // Build Expo push messages
        const messages = tokens.map(t => ({
            to: t.token,
            sound: 'default' as const,
            title,
            body,
            data: data || {},
        }));

        // Send via Expo Push API
        await axios.post('https://exp.host/--/api/v2/push/send', messages, {
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            }
        });
    } catch (error) {
        log({ module: 'push', level: 'error' }, `Failed to send push notification: ${error}`);
    }
}
