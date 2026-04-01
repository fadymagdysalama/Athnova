import { supabase } from './supabase';

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
    await supabase.functions.invoke('send-push', { body: payload });
  } catch {
    // Intentionally swallowed — notifications are non-critical
  }
}
