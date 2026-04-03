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
  accent = false,
  onPress,
}: {
  label: string;
  value: string;
  accent?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.statCard, accent && styles.statCardAccent]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
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
  const { unreadCount, fetchNotifications } = useNotificationStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSessionItem[]>([]);
  const [todayWorkout, setTodayWorkout] = useState<{
    programTitle: string;
    currentDay: number;
    totalDays: number;
    programId: string;
    exercises: Array<{ exercise_name: string; sets: number; reps: string }>;
  } | null>(null);
  const [activePrograms, setActivePrograms] = useState<Array<{
    id: string;
    program_id: string;
    current_day: number;
    program: { title: string; duration_days: number };
  }>>([]);

  if (!profile) return null;

  const isCoach = profile.role === 'coach';

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();

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
          .select('id, program_id, current_day, program:programs(id, title, duration_days)', { count: 'exact' })
          .eq('client_id', profile.id)
          .order('started_at', { ascending: false }),
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

      const rawAssignments = (assignmentsRes.data ?? []) as unknown as Array<{
        id: string;
        program_id: string;
        current_day: number;
        program: { title: string; duration_days: number } | null;
      }>;
      const validAssignments = rawAssignments.filter((a) => a.program != null);
      const firstAssignment = validAssignments[0];

      setStats({
        primaryCount: assignmentsRes.count ?? 0,
        secondaryCount: workoutsRes.count ?? 0,
        primaryLabel: t('home.activePrograms'),
        secondaryLabel: t('home.daysDone'),
      });
      setActivePrograms(validAssignments.map((a) => ({ ...a, program: a.program! })));
      setUpcomingSessions((sessionsRes.data as UpcomingSessionItem[] | null) ?? []);

      // Fetch today's workout exercises for the first active program
      if (firstAssignment?.program) {
        const { data: dayData } = await supabase
          .from('program_days')
          .select('id')
          .eq('program_id', firstAssignment.program_id)
          .eq('day_number', firstAssignment.current_day)
          .maybeSingle();

        if (!isMounted) return;

        if (dayData) {
          const { data: exercises } = await supabase
            .from('program_exercises')
            .select('exercise_name, sets, reps')
            .eq('day_id', dayData.id)
            .order('order_index', { ascending: true })
            .limit(3);

          if (!isMounted) return;
          setTodayWorkout({
            programTitle: firstAssignment.program!.title,
            currentDay: firstAssignment.current_day,
            totalDays: firstAssignment.program!.duration_days,
            programId: firstAssignment.program_id,
            exercises: (exercises ?? []) as Array<{ exercise_name: string; sets: number; reps: string }>,
          });
        } else {
          setTodayWorkout(null);
        }
      } else {
        setTodayWorkout(null);
      }
    };

      loadDashboard();

      return () => {
        isMounted = false;
      };
    }, [isCoach, profile.id, t, fetchNotifications])
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
              <View style={styles.bellInner}>
                <View style={styles.bellDome} />
                <View style={styles.bellBase} />
                <View style={styles.bellKnocker} />
              </View>
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
            accent
            onPress={() => router.push(isCoach ? '/(tabs)/clients' : '/(tabs)/programs')}
          />
          <StatCard
            label={stats?.secondaryLabel ?? (isCoach ? t('home.activePrograms') : 'Workouts')}
            value={String(stats?.secondaryCount ?? 0)}
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
          <>
            {activePrograms.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('home.activePrograms')}</Text>
                {activePrograms.map((prog) => {
                  const pct = Math.min(
                    ((prog.current_day - 1) / Math.max(prog.program.duration_days, 1)) * 100,
                    100,
                  );
                  return (
                    <TouchableOpacity
                      key={prog.id}
                      style={styles.programCard}
                      onPress={() =>
                        router.push({ pathname: '/programs/detail', params: { id: prog.program_id } })
                      }
                      activeOpacity={0.8}
                    >
                      <View style={styles.programCardHeader}>
                        <Text style={styles.programCardTitle} numberOfLines={1}>
                          {prog.program.title}
                        </Text>
                        <Text style={styles.programCardDay}>
                          Day {prog.current_day}/{prog.program.duration_days}
                        </Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.round(pct)}%` as any }]} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Today's Workout</Text>
              {todayWorkout ? (
                <TouchableOpacity
                  style={styles.workoutCard}
                  onPress={() =>
                    router.push({ pathname: '/programs/detail', params: { id: todayWorkout.programId } })
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.workoutCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.workoutTitle}>{todayWorkout.programTitle}</Text>
                      <Text style={styles.workoutDayMeta}>
                        Day {todayWorkout.currentDay} of {todayWorkout.totalDays}
                      </Text>
                    </View>
                    <Text style={styles.workoutArrow}>›</Text>
                  </View>
                  {todayWorkout.exercises.length > 0 ? (
                    <View style={styles.workoutExerciseList}>
                      {todayWorkout.exercises.map((ex, i) => (
                        <View key={i} style={styles.workoutExerciseRow}>
                          <View style={styles.workoutExerciseDot} />
                          <Text style={styles.workoutExerciseName}>{ex.exercise_name}</Text>
                          <Text style={styles.workoutExerciseMeta}>{ex.sets}×{ex.reps}</Text>
                        </View>
                      ))}
                      {todayWorkout.exercises.length === 3 && (
                        <Text style={styles.workoutMoreText}>+ more exercises</Text>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.emptySubtext}>No exercises added for this day yet.</Text>
                  )}
                </TouchableOpacity>
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
          </>
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  bellInner: {
    width: 20,
    height: 22,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 1,
  },
  // dome arc — top of the bell
  bellDome: {
    width: 14,
    height: 10,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.accent,
  },
  // solid brim — the wide base rim of the bell
  bellBase: {
    width: 18,
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 1.5,
    marginTop: -1,
  },
  // knocker — small circle hanging below
  bellKnocker: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 2,
  },
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
    fontWeight: '800',
    lineHeight: 13,
  },
  greeting: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  dashboardLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontWeight: '500',
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
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statCardAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  statValue: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  statValueAccent: {
    color: colors.textInverse,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  statLabelAccent: {
    color: 'rgba(255,255,255,0.8)',
  },
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
    letterSpacing: 0.1,
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
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionCalendarBadge: {
    width: 56,
    height: 60,
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
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  sessionContent: {
    flex: 1,
  },
  sessionDate: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  sessionTime: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.accent,
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
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  workoutCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  workoutTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  workoutDayMeta: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  workoutArrow: {
    fontSize: 26,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  workoutExerciseList: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  workoutExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  workoutExerciseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  workoutExerciseName: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  workoutExerciseMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  workoutMoreText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
    marginLeft: spacing.lg,
  },
  programCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  programCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  programCardTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.sm,
  },
  programCardDay: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.accent,
    backgroundColor: colors.accentFaded,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  progressTrack: {
    height: 5,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
