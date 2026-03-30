import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { profile } = useAuthStore();

  if (!profile) return null;

  const isCoach = profile.role === 'coach';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {t('home.greeting', { name: profile.display_name })}
          </Text>
          <Text style={styles.dashboardLabel}>
            {isCoach ? t('home.coachDashboard') : t('home.clientDashboard')}
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          {isCoach ? (
            <>
              <StatCard label={t('home.activeClients')} value="0" icon="👥" />
              <StatCard label={t('home.activePrograms')} value="0" icon="📋" />
            </>
          ) : (
            <>
              <StatCard label={t('home.activePrograms')} value="0" icon="📋" />
              <StatCard label="Workouts" value="0" icon="🔥" />
            </>
          )}
        </View>

        {/* Upcoming Sessions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('home.upcomingSessions')}</Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyText}>{t('home.noSessions')}</Text>
          </View>
        </View>

        {/* Today's Workout (for clients) */}
        {!isCoach && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Workout</Text>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>💪</Text>
              <Text style={styles.emptyText}>No workout scheduled</Text>
              <Text style={styles.emptySubtext}>
                Browse programs or connect with a coach
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  header: {
    paddingTop: spacing.xl,
    marginBottom: spacing['2xl'],
  },
  greeting: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
  },
  dashboardLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing['3xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
