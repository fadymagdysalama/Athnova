import { Tabs, Redirect } from 'expo-router';
import { Text, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, fontSize, spacing } from '../../src/constants/theme';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    home: '🏠',
    programs: '📋',
    schedule: '📅',
    clients: '👥',
    progress: '📊',
    profile: '⚙️',
    marketplace: '🏪',
  };

  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.icon, focused && styles.iconFocused]}>
        {icons[name] || '•'}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const { session, profile } = useAuthStore();

  if (!session) return <Redirect href="/auth/login" />;
  if (!profile) return <Redirect href="/auth/setup-profile" />;

  const isCoach = profile.role === 'coach';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: t('tabs.programs'),
          tabBarIcon: ({ focused }) => <TabIcon name="programs" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ({ focused }) => <TabIcon name="schedule" focused={focused} />,
        }}
      />
      {isCoach ? (
        <Tabs.Screen
          name="clients"
          options={{
            title: t('tabs.clients'),
            tabBarIcon: ({ focused }) => <TabIcon name="clients" focused={focused} />,
          }}
        />
      ) : (
        <Tabs.Screen
          name="clients"
          options={{
            title: t('connections.myCoach'),
            tabBarIcon: ({ focused }) => <TabIcon name="clients" focused={focused} />,
          }}
        />
      )}
      {!isCoach ? (
        <Tabs.Screen
          name="progress"
          options={{
            title: t('tabs.progress'),
            tabBarIcon: ({ focused }) => <TabIcon name="progress" focused={focused} />,
          }}
        />
      ) : (
        <Tabs.Screen
          name="progress"
          options={{
            href: null, // Hide for coaches (they see client progress elsewhere)
          }}
        />
      )}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          title: t('tabs.marketplace'),
          tabBarIcon: ({ focused }) => <TabIcon name="marketplace" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 85,
    paddingBottom: 25,
    paddingTop: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
    opacity: 0.5,
  },
  iconFocused: {
    opacity: 1,
  },
});
