import { invokeEdgeFunction } from './invokeEdgeFunction';

export interface NotificationPayload {
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Fire-and-forget helper that calls the send-push Edge Function.
 * Inserts an in-app notification row AND sends a push if the recipient
 * has a registered Expo push token. Never throws — notification failures
 * must not block the action that triggered them.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    const { data, error, status, responseText } = await invokeEdgeFunction<{
      success?: boolean;
      push?: boolean;
    }>('send-push', payload);

    if (error) {
      console.error('send-push invoke failed:', status, responseText || error);
    }
  } catch (error) {
    console.error('sendNotification failed:', error);
  }
}
