import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';

// ─── Foreground notification presentation ────────────────────────────────────
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Native notifications module unavailable (Expo Go / web)
}

// ─── Permission + token registration ─────────────────────────────────────────
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

// ─── Navigation mapping for notification tap ─────────────────────────────────
function handleNotificationTap(data: Record<string, string>) {
  const type = data?.type ?? '';

  if (
    type === 'session_reminder_24h' ||
    type === 'session_reminder_1h' ||
    type === 'session_booked' ||
    type === 'session_cancelled' ||
    type === 'session_left'
  ) {
    router.push('/(tabs)/schedule');
  } else if (type.startsWith('program')) {
    router.push('/(tabs)/programs');
  } else if (type.startsWith('connection')) {
    router.push('/(tabs)/clients');
  } else {
    router.push('/notifications');
  }
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useNotifications() {
  const { session } = useAuthStore();
  const { fetchNotifications, subscribeToNotifications, reset } = useNotificationStore();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!session?.user) {
      reset();
      return;
    }

    const userId = session.user.id;

    // 1. Register push token and save it to the profile row
    registerForPushNotificationsAsync().then(async (token) => {
      if (!token) return;
      await supabase
        .from('profiles')
        .update({ expo_push_token: token } as any)
        .eq('id', userId);
    });

    // 2. Fetch existing in-app notifications
    fetchNotifications();

    // 3. Real-time subscription for incoming notifications
    unsubscribeRef.current = subscribeToNotifications(userId);

    // 4. Listener: notification received while app is in foreground
    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(
        () => { fetchNotifications(); },
      );

      // 5. Listener: user taps a notification (foreground or background)
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = (response.notification.request.content.data ?? {}) as Record<string, string>;
          handleNotificationTap(data);
        },
      );
    } catch {
      // Native notifications module unavailable (Expo Go / web)
    }

    return () => {
      unsubscribeRef.current?.();
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [session?.user?.id]);
}
