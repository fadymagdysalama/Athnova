import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';

// Note: setNotificationHandler and Android channel are configured in index.ts
// at the earliest possible point before any React component mounts.

// ─── Permission + token registration ─────────────────────────────────────────
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    let token: string | null = null;

    if (Platform.OS === 'ios') {
      const { data } = await Notifications.getDevicePushTokenAsync();
      token = data;
    } else if (projectId) {
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      token = data;
    }
    return token;
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
  const appStateSubscription = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!session?.user) {
      reset();
      return;
    }

    const userId = session.user.id;

    registerForPushNotificationsAsync().then(async (token) => {
      if (!token) return;
await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);
    });

    // 2. Fetch existing in-app notifications
    fetchNotifications();

    appStateSubscription.current = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchNotifications();
      }
    });

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
      appStateSubscription.current?.remove();
    };
  }, [session?.user?.id]);
}
