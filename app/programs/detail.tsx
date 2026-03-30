import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '../../src/stores/programStore';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: colors.success,
  intermediate: colors.warning,
  advanced: colors.error,
};

export default function ProgramDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentProgram, isLoading, fetchProgramWithDays, completedDayIds, fetchCompletedDays, logWorkout } = useProgramStore();
  const { profile } = useAuthStore();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [markingDay, setMarkingDay] = useState<string | null>(null);

  const isCoach = profile?.role === 'coach';

  useEffect(() => {
    if (id) {
      fetchProgramWithDays(id);
      if (!isCoach) fetchCompletedDays(id);
    }
  }, [id]);

  useEffect(() => {
    // Auto-expand first day
    if (currentProgram?.days?.length) {
      setExpandedDay(currentProgram.days[0].id);
    }
  }, [currentProgram?.id]);

  if (isLoading || !currentProgram) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const diffColor = DIFFICULTY_COLOR[currentProgram.difficulty] ?? colors.accent;

  const handleMarkComplete = async (dayId: string) => {
    setMarkingDay(dayId);
    const { error } = await logWorkout(currentProgram.id, dayId);
    setMarkingDay(null);
    if (error) Alert.alert(t('common.error'), error);
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {isCoach && (
            <TouchableOpacity
              style={styles.editHeaderBtn}
              onPress={() => router.push({ pathname: '/programs/edit', params: { id: currentProgram.id } })}
            >
              <Text style={styles.editHeaderBtnText}>{t('programs.editProgram')}</Text>
            </TouchableOpacity>
          )}
          {isCoach && (
            <TouchableOpacity
              style={styles.assignHeaderBtn}
              onPress={() => router.push({ pathname: '/programs/assign', params: { id: currentProgram.id } })}
            >
              <Text style={styles.assignHeaderBtnText}>{t('programs.assignToClient')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Program info card */}
        <View style={styles.infoCard}>
          <Text style={styles.programTitle}>{currentProgram.title}</Text>
          {!!currentProgram.description && (
            <Text style={styles.programDesc}>{currentProgram.description}</Text>
          )}
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: `${diffColor}18` }]}>
              <Text style={[styles.badgeText, { color: diffColor }]}>
                {t(`programs.${currentProgram.difficulty}` as any)}
              </Text>
            </View>
            <Text style={styles.metaText}>
              {t('programs.days', { count: currentProgram.duration_days })}
            </Text>
          </View>
        </View>

        {/* Days */}
        <Text style={styles.sectionTitle}>{t('programs.step2')}</Text>
        {currentProgram.days.map((day) => (
          <View key={day.id} style={styles.dayCard}>
            <TouchableOpacity
              style={styles.dayHeader}
              onPress={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
            >
              <Text style={styles.dayTitle}>
                {t('programs.day', { number: day.day_number })}
              </Text>
              <View style={styles.dayHeaderRight}>
                {!isCoach && completedDayIds.has(day.id) && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>✓ {t('programs.completed')}</Text>
                  </View>
                )}
                <Text style={styles.dayMeta}>
                  {day.exercises.length} {t('programs.exercises')}  {expandedDay === day.id ? '▲' : '▼'}
                </Text>
              </View>
            </TouchableOpacity>

            {expandedDay === day.id && (
              <View style={styles.dayBody}>
                {day.exercises.length === 0 ? (
                  <Text style={styles.noExText}>{t('programs.noExercises')}</Text>
                ) : (
                  day.exercises.map((ex, idx) => (
                    <View key={ex.id} style={styles.exerciseCard}>
                      <View style={styles.exerciseTop}>
                        <View style={styles.exerciseIndex}>
                          <Text style={styles.exerciseIndexText}>{idx + 1}</Text>
                        </View>
                        <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                      </View>
                      <View style={styles.exerciseMeta}>
                        <View style={styles.statChip}>
                          <Text style={styles.statChipText}>
                            {t('programs.sets_reps', { sets: ex.sets, reps: ex.reps })}
                          </Text>
                        </View>
                        {!!ex.rest_time && (
                          <View style={styles.statChip}>
                            <Text style={styles.statChipText}>
                              {t('programs.rest', { time: ex.rest_time })}
                            </Text>
                          </View>
                        )}
                      </View>
                      {!!ex.notes && (
                        <Text style={styles.exerciseNotes}>{ex.notes}</Text>
                      )}
                      {!!(ex as any).video_url && (
                        <TouchableOpacity
                          style={styles.videoLink}
                          onPress={() => Linking.openURL((ex as any).video_url)}
                        >
                          <Text style={styles.videoLinkText}>▶ {t('programs.watchVideo')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
                {/* Mark Complete button – clients only */}
                {!isCoach && (
                  <TouchableOpacity
                    style={[
                      styles.markCompleteBtn,
                      completedDayIds.has(day.id) && styles.markCompleteBtnDone,
                    ]}
                    onPress={() => !completedDayIds.has(day.id) && handleMarkComplete(day.id)}
                    activeOpacity={completedDayIds.has(day.id) ? 1 : 0.7}
                    disabled={markingDay === day.id}
                  >
                    {markingDay === day.id ? (
                      <ActivityIndicator size="small" color={colors.surface} />
                    ) : (
                      <Text style={[
                        styles.markCompleteBtnText,
                        completedDayIds.has(day.id) && styles.markCompleteBtnTextDone,
                      ]}>
                        {completedDayIds.has(day.id)
                          ? `✓ ${t('programs.completed')}`
                          : t('programs.markComplete')}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 60, paddingBottom: spacing.lg, paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editHeaderBtn: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  editHeaderBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  assignHeaderBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  assignHeaderBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textInverse },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing['2xl'], paddingBottom: 80, gap: spacing.md },

  // Info card
  infoCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  programTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  programDesc: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  metaText: { fontSize: fontSize.sm, color: colors.textMuted },
  badge: { borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600' },

  // Section
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Day card
  dayCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  dayTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  dayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  completedBadge: {
    backgroundColor: `${colors.success}18`,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  completedBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  dayBody: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, gap: spacing.sm },
  noExText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // Mark complete button
  markCompleteBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  markCompleteBtnDone: {
    backgroundColor: `${colors.success}18`,
    borderWidth: 1,
    borderColor: colors.success,
  },
  markCompleteBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#ffffff' },
  markCompleteBtnTextDone: { color: colors.success },

  // Exercise card
  exerciseCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    padding: spacing.sm, gap: spacing.xs,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exerciseIndex: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: `${colors.primary}18`, alignItems: 'center', justifyContent: 'center',
  },
  exerciseIndexText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  exerciseName: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  exerciseMeta: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  statChip: {
    backgroundColor: colors.card, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  statChipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  exerciseNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  videoLink: {
    marginTop: spacing.xs,
    backgroundColor: `${colors.error}10`,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: `${colors.error}30`,
  },
  videoLinkText: { fontSize: fontSize.xs, fontWeight: '700', color: '#CC0000' },
});
