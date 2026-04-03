import { Tabs, Redirect } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, spacing } from '../../src/constants/theme';

// ─── Minimal View-based icons ──────────────────────────────────────────────

function HomeIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 20, alignItems: 'center' }}>
      {/* roof */}
      <View style={{ width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
      {/* body */}
      <View style={{ width: 14, height: 10, backgroundColor: color, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
    </View>
  );
}

function ProgramsIcon({ color }: { color: string }) {
  const line = { height: 2, backgroundColor: color, borderRadius: 1 };
  return (
    <View style={{ width: 20, gap: 4 }}>
      <View style={[line, { width: 20 }]} />
      <View style={[line, { width: 14 }]} />
      <View style={[line, { width: 17 }]} />
    </View>
  );
}

function CalendarIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 20, height: 20, borderWidth: 2, borderColor: color, borderRadius: 4, alignItems: 'center' }}>
      <View style={{ width: 14, height: 1.5, backgroundColor: color, marginTop: 5 }} />
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
        <View style={{ width: 3.5, height: 3.5, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: 3.5, height: 3.5, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: 3.5, height: 3.5, backgroundColor: color, borderRadius: 1 }} />
      </View>
    </View>
  );
}

function PeopleIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 20, flexDirection: 'row', alignItems: 'flex-end' }}>
      <View style={{ alignItems: 'center', marginRight: -4 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, opacity: 0.7 }} />
        <View style={{ width: 14, height: 8, borderTopLeftRadius: 7, borderTopRightRadius: 7, backgroundColor: color, opacity: 0.7 }} />
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <View style={{ width: 16, height: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: color }} />
      </View>
    </View>
  );
}

function TrendIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 18, justifyContent: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        <View style={{ width: 4, height: 6, backgroundColor: color, borderRadius: 1, opacity: 0.5 }} />
        <View style={{ width: 4, height: 10, backgroundColor: color, borderRadius: 1, opacity: 0.7 }} />
        <View style={{ width: 4, height: 14, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: 4, height: 18, backgroundColor: color, borderRadius: 1 }} />
      </View>
    </View>
  );
}

function StoreIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 20, alignItems: 'center' }}>
      <View style={{ width: 20, height: 7, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: color, opacity: 0.8 }} />
      <View style={{ width: 20, height: 11, backgroundColor: color, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }}>
        <View style={{ width: 8, height: 7, backgroundColor: colors.surface, borderRadius: 1, alignSelf: 'center', marginTop: 2 }} />
      </View>
    </View>
  );
}

function LibraryIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
      <View style={{ width: 5, height: 13, backgroundColor: color, borderRadius: 1, opacity: 0.55 }} />
      <View style={{ width: 5, height: 18, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: 5, height: 15, backgroundColor: color, borderRadius: 1, opacity: 0.75 }} />
      <View style={{ width: 5, height: 20, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

function GearIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const activeColor = colors.accent;
  const inactiveColor = colors.textMuted;
  const color = focused ? activeColor : inactiveColor;

  const iconMap: Record<string, React.ReactNode> = {
    home: <HomeIcon color={color} />,
    library: <LibraryIcon color={color} />,
    programs: <ProgramsIcon color={color} />,
    schedule: <CalendarIcon color={color} />,
    clients: <PeopleIcon color={color} />,
    progress: <TrendIcon color={color} />,
    profile: <GearIcon color={color} />,
    marketplace: <StoreIcon color={color} />,
  };

  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      {iconMap[name] ?? null}
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
        tabBarActiveTintColor: colors.accent,
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
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ focused }) => <TabIcon name="library" focused={focused} />,
          href: isCoach ? undefined : null, // Visible for coaches, hidden for clients
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
        name="marketplace"
        options={{
          title: t('tabs.marketplace'),
          tabBarIcon: ({ focused }) => <TabIcon name="marketplace" focused={focused} />,
          href: isCoach ? null : undefined, // Hidden for coaches, visible for clients
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderLight,
    borderTopWidth: 1,
    height: 88,
    paddingBottom: 24,
    paddingTop: spacing.sm,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabIconWrap: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabIconWrapActive: {
    backgroundColor: colors.accentFaded,
  },
});
