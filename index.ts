import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set foreground notification handler as early as possible — before any React
// component mounts. This is required for iOS (New Architecture) to reliably
// show banners while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    showBadge: true,
  }).catch(() => {});
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
