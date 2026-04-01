import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { supabase } from '../../src/lib/supabase';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';

function StatCard({
  label,
  value,
  icon,
  onPress,
}: {
  label: string;
  value: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

interface DashboardStats {
  primaryCount: number;
  secondaryCount: number;
  primaryLabel: string;
  secondaryLabel: string;
}

interface UpcomingSessionItem {
  id: string;
  date: string;
  start_time: string;
  notes?: string | null;
}

function formatSessionTime(time: string): string {
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText ?? '0');

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }

  const period = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 || 12;

  if (minute === 0) {
    return `${normalizedHour} ${period}`;
  }

  return `${normalizedHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatSessionDate(date: string): string {
  const sessionDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(sessionDate.getTime())) {
    return date;
  }

  return sessionDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { profile } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSessionItem[]>([]);
  const [todayWorkout, setTodayWorkout] = useState<string | null>(null);

  if (!profile) return null;

  const isCoach = profile.role === 'coach';

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadDashboard = async () => {
      const today = new Date().toISOString().slice(0, 10);

      if (isCoach) {
        const [clientsRes, programsRes, sessionsRes] = await Promise.all([
          supabase
            .from('coach_client_requests')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', profile.id)
            .eq('status', 'accepted'),
          supabase
            .from('programs')
            .select('id', { count: 'exact', head: true })
            .eq('creator_id', profile.id),
          supabase
            .from('sessions')
            .select('id, date, start_time, notes')
            .eq('coach_id', profile.id)
            .eq('status', 'scheduled')
            .gte('date', today)
            .order('date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(3),
        ]);

        if (!isMounted) return;

        setStats({
          primaryCount: clientsRes.count ?? 0,
          secondaryCount: programsRes.count ?? 0,
          primaryLabel: t('home.activeClients'),
          secondaryLabel: t('home.activePrograms'),
        });
        setUpcomingSessions((sessionsRes.data as UpcomingSessionItem[] | null) ?? []);
        setTodayWorkout(null);
        return;
      }

      const [assignmentsRes, workoutsRes, sessionIdsRes] = await Promise.all([
        supabase
          .from('program_assignments')
          .select('id, current_day, program:programs(title)', { count: 'exact' })
          .eq('client_id', profile.id),
        supabase
          .from('workout_logs')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', profile.id),
        supabase
          .from('session_clients')
          .select('session_id')
          .eq('client_id', profile.id),
      ]);

      const sessionIds = (sessionIdsRes.data ?? []).map((item: any) => item.session_id as string);
      const sessionsRes = sessionIds.length > 0
        ? await supabase
            .from('sessions')
            .select('id, date, start_time, notes')
            .in('id', sessionIds)
            .eq('status', 'scheduled')
            .gte('date', today)
            .order('date', { ascending: true })
            .order('start_time', { ascending: true })
            .limit(3)
        : { data: [] };

      if (!isMounted) return;

      const assignments = assignmentsRes.data ?? [];
      const firstAssignment = assignments[0] as any;

      setStats({
        primaryCount: assignmentsRes.count ?? 0,
        secondaryCount: workoutsRes.count ?? 0,
        primaryLabel: t('home.activePrograms'),
        secondaryLabel: 'Workouts',
      });
      setUpcomingSessions((sessionsRes.data as UpcomingSessionItem[] | null) ?? []);
      setTodayWorkout(
        firstAssignment?.program?.title
          ? `${firstAssignment.program.title} • Day ${firstAssignment.current_day}`
          : null,
      );
    };

      loadDashboard();

      return () => {
        isMounted = false;
      };
    }, [isCoach, profile.id, t])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.greeting}>
                {t('home.greeting', { name: profile.display_name })}
              </Text>
              <Text style={styles.dashboardLabel}>
                {isCoach ? t('home.coachDashboard') : t('home.clientDashboard')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.bellButton}
              onPress={() => router.push('/notifications')}
              activeOpacity={0.7}
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            label={stats?.primaryLabel ?? (isCoach ? t('home.activeClients') : t('home.activePrograms'))}
            value={String(stats?.primaryCount ?? 0)}
            icon={isCoach ? '👥' : '📋'}
            onPress={() => router.push(isCoach ? '/(tabs)/clients' : '/(tabs)/programs')}
          />
          <StatCard
            label={stats?.secondaryLabel ?? (isCoach ? t('home.activePrograms') : 'Workouts')}
            value={String(stats?.secondaryCount ?? 0)}
            icon={isCoach ? '📋' : '🔥'}
            onPress={() => router.push(isCoach ? '/(tabs)/programs' : '/(tabs)/progress')}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('home.upcomingSessions')}</Text>
          {upcomingSessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyText}>{t('home.noSessions')}</Text>
            </View>
          ) : (
            upcomingSessions.map((session) => (
              <View key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionCardHeader}>
                  <View style={styles.sessionCalendarBadge}>
                    <Text style={styles.sessionCalendarDay}>{formatSessionDate(session.date).split(' ')[2] ?? ''}</Text>
                    <Text style={styles.sessionCalendarMonth}>{formatSessionDate(session.date).split(' ')[1] ?? ''}</Text>
                  </View>
                  <View style={styles.sessionContent}>
                    <Text style={styles.sessionDate}>{formatSessionDate(session.date)}</Text>
                    <Text style={styles.sessionTime}>{formatSessionTime(session.start_time)}</Text>
                    {!!session.notes && <Text style={styles.sessionNotes}>{session.notes}</Text>}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {!isCoach && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Workout</Text>
            {todayWorkout ? (
              <View style={styles.workoutCard}>
                <Text style={styles.workoutTitle}>{todayWorkout}</Text>
                <Text style={styles.emptySubtext}>Open Programs to continue your assigned plan.</Text>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>💪</Text>
                <Text style={styles.emptyText}>No workout scheduled</Text>
                <Text style={styles.emptySubtext}>
                  Browse programs or connect with a coach
                </Text>
              </View>
            )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  bellButton: {
    position: 'relative',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bellIcon: { fontSize: 20 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
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
  sessionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionCalendarBadge: {
    width: 58,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  sessionCalendarDay: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textInverse,
    lineHeight: 24,
  },
  sessionCalendarMonth: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textInverse,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  sessionContent: {
    flex: 1,
  },
  sessionDate: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  sessionTime: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  sessionNotes: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  workoutCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  workoutTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
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
