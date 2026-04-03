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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '../../src/stores/programStore';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { ProgramExercise } from '../../src/types';

const SS_COLOR = '#EA580C';
const getSupersetLetter = (group: number) =>
  String.fromCharCode(64 + ((group - 1) % 26) + 1);

// ─── Group consecutive exercises with shared superset_group ────────────────────
type ExSegment =
  | { type: 'single'; exercise: ProgramExercise; idx: number }
  | { type: 'superset'; group: number; label: string; exercises: Array<{ ex: ProgramExercise; idx: number }> };

function groupExercises(exercises: ProgramExercise[]): ExSegment[] {
  const segments: ExSegment[] = [];
  const visited = new Set<string>();
  exercises.forEach((ex, idx) => {
    if (visited.has(ex.id)) return;
    const sg = ex.superset_group;
    if (sg !== null && sg !== undefined) {
      const members = exercises
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.superset_group === sg && !visited.has(e.id));
      members.forEach(({ e }) => visited.add(e.id));
      segments.push({
        type: 'superset',
        group: sg,
        label: getSupersetLetter(sg),
        exercises: members.map(({ e, i }) => ({ ex: e, idx: i })),
      });
    } else {
      visited.add(ex.id);
      segments.push({ type: 'single', exercise: ex, idx });
    }
  });
  return segments;
}

// ─── Single exercise card (shared renderer) ────────────────────────────────────
function ExerciseCard({
  ex,
  idx,
  inSuperset = false,
}: {
  ex: ProgramExercise;
  idx: number;
  inSuperset?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.exerciseCard, inSuperset && detailStyles.exerciseCardInSuperset]}>
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
        {!!ex.weight && (
          <View style={styles.statChip}>
            <Text style={styles.statChipText}>{ex.weight}</Text>
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
  );
}

export default function ProgramDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentProgram, isLoading, fetchProgramWithDays, completedDayIds, fetchCompletedDays, logWorkout, submitFeedback, fetchProgramFeedback } = useProgramStore();
  const { profile } = useAuthStore();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [markingDay, setMarkingDay] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, { id: string; text: string | null }>>({});
  const [feedbackEditing, setFeedbackEditing] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  const isCoach = profile?.role === 'coach';

  useEffect(() => {
    if (id) {
      fetchProgramWithDays(id);
      if (!isCoach) {
        fetchCompletedDays(id);
        fetchProgramFeedback(id).then(({ feedbacks: data }) => {
          const map: Record<string, { id: string; text: string | null }> = {};
          for (const f of data) { map[f.day_id] = { id: f.id, text: f.text }; }
          setFeedbacks(map);
        });
      }
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

  const diffColor = colors.primary;

  const handleMarkComplete = async (dayId: string) => {
    setMarkingDay(dayId);
    const { error } = await logWorkout(currentProgram.id, dayId);
    setMarkingDay(null);
    if (error) Alert.alert(t('common.error'), error);
  };

  const handleEditFeedback = (dayId: string) => {
    setFeedbackEditing(dayId);
    setFeedbackDraft(feedbacks[dayId]?.text ?? '');
  };

  const handleSaveFeedback = async (dayId: string) => {
    if (!currentProgram) return;
    setSavingFeedback(true);
    const { error } = await submitFeedback(currentProgram.id, dayId, feedbackDraft.trim());
    setSavingFeedback(false);
    if (error) {
      Alert.alert(t('common.error'), error);
    } else {
      setFeedbacks((prev) => ({ ...prev, [dayId]: { ...prev[dayId], text: feedbackDraft.trim() } }));
      setFeedbackEditing(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{currentProgram.title}</Text>
        <View style={styles.navActions}>
          {isCoach && (
            <TouchableOpacity
              style={styles.navActionBtn}
              onPress={() => router.push({ pathname: '/programs/edit', params: { id: currentProgram.id } })}
            >
              <Text style={styles.navActionText}>{t('programs.editProgram')}</Text>
            </TouchableOpacity>
          )}
          {isCoach && (
            <TouchableOpacity
              style={[styles.navActionBtn, styles.navActionBtnPrimary]}
              onPress={() => router.push({ pathname: '/programs/assign', params: { id: currentProgram.id } })}
            >
              <Text style={[styles.navActionText, styles.navActionTextPrimary]}>{t('programs.assignToClient')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero info card */}
        <View style={styles.infoCard}>
          <Text style={styles.programTitle}>{currentProgram.title}</Text>
          {!!currentProgram.description && (
            <Text style={styles.programDesc}>{currentProgram.description}</Text>
          )}
          <View style={styles.metaRow}>
            <View style={styles.metaDurationPill}>
              <Text style={styles.metaDurationText}>
                {t('programs.days', { count: currentProgram.duration_days })}
              </Text>
            </View>
          </View>
        </View>

        {/* Days */}
        <Text style={styles.sectionTitle}>{t('programs.step2')}</Text>
        {currentProgram.days.map((day) => {
          const isDone = !isCoach && completedDayIds.has(day.id);
          return (
          <View key={day.id} style={[styles.dayCard, isDone && styles.dayCardDone]}>
            <TouchableOpacity
              style={styles.dayHeader}
              onPress={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.dayNumberBadge, isDone && styles.dayNumberBadgeDone]}>
                <Text style={[styles.dayNumberText, isDone && styles.dayNumberTextDone]}>
                  {isDone ? '✓' : day.day_number}
                </Text>
              </View>
              <View style={styles.dayHeaderCenter}>
                <Text style={styles.dayTitle}>{t('programs.day', { number: day.day_number })}</Text>
                <Text style={styles.daySubtitle}>{day.exercises.length} {t('programs.exercises')}</Text>
              </View>
              <Text style={styles.dayChevron}>{expandedDay === day.id ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {expandedDay === day.id && (
              <View style={styles.dayBody}>
                {day.exercises.length === 0 ? (
                  <Text style={styles.noExText}>{t('programs.noExercises')}</Text>
                ) : (
                  groupExercises(day.exercises).map((segment, segIdx) => {
                    if (segment.type === 'superset') {
                      return (
                        <View key={`ss-${segment.group}-${segIdx}`} style={detailStyles.supersetBlock}>
                          <View style={detailStyles.supersetHeader}>
                            <View style={detailStyles.supersetHeaderLine} />
                            <View style={detailStyles.supersetHeaderPill}>
                              <Text style={detailStyles.supersetHeaderText}>
                                ⚡ {t('programs.supersetLabel', { label: segment.label })}
                              </Text>
                            </View>
                            <View style={detailStyles.supersetHeaderLine} />
                          </View>
                          {segment.exercises.map(({ ex, idx }, ssIdx) => (
                            <React.Fragment key={ex.id}>
                              <ExerciseCard ex={ex} idx={idx} inSuperset />
                              {ssIdx < segment.exercises.length - 1 && (
                                <View style={detailStyles.supersetDivider}>
                                  <Text style={detailStyles.supersetDividerText}>↩ continue</Text>
                                </View>
                              )}
                            </React.Fragment>
                          ))}
                        </View>
                      );
                    }
                    return <ExerciseCard key={segment.exercise.id} ex={segment.exercise} idx={segment.idx} />;
                  })
                )}
                {/* Mark Complete button – clients only */}
                {!isCoach && (
                  <TouchableOpacity
                    style={[
                      styles.markCompleteBtn,
                      completedDayIds.has(day.id) && styles.markCompleteBtnDone,
                    ]}
                    onPress={() => !completedDayIds.has(day.id) && handleMarkComplete(day.id)}
                    activeOpacity={completedDayIds.has(day.id) ? 1 : 0.8}
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

                {/* Client feedback per day */}
                {!isCoach && (
                  <View style={styles.feedbackSection}>
                    <Text style={styles.feedbackSectionTitle}>{t('programs.yourFeedback')}</Text>
                    {feedbackEditing === day.id ? (
                      <View>
                        <TextInput
                          style={styles.feedbackInput}
                          value={feedbackDraft}
                          onChangeText={setFeedbackDraft}
                          placeholder={t('programs.feedbackPlaceholder')}
                          placeholderTextColor={colors.textMuted}
                          multiline
                          numberOfLines={3}
                        />
                        <View style={styles.feedbackActions}>
                          <TouchableOpacity
                            style={styles.feedbackCancelBtn}
                            onPress={() => setFeedbackEditing(null)}
                          >
                            <Text style={styles.feedbackCancelText}>{t('common.cancel')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.feedbackSaveBtn, savingFeedback && styles.feedbackSaveBtnDisabled]}
                            onPress={() => handleSaveFeedback(day.id)}
                            disabled={savingFeedback}
                          >
                            {savingFeedback ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.feedbackSaveText}>{t('common.save')}</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : feedbacks[day.id]?.text ? (
                      <View style={styles.feedbackCard}>
                        <Text style={styles.feedbackText}>"{feedbacks[day.id].text}"</Text>
                        <TouchableOpacity onPress={() => handleEditFeedback(day.id)}>
                          <Text style={styles.feedbackEditText}>{t('programs.editFeedback')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.feedbackAddBtn}
                        onPress={() => handleEditFeedback(day.id)}
                      >
                        <Text style={styles.feedbackAddText}>+ {t('programs.leaveFeedback')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // ── Navbar ────────────────────────────────────────────────────────────────
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backIcon: { fontSize: 26, color: colors.primary, fontWeight: '600', lineHeight: 30, marginLeft: -2 },
  navTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navActionBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  navActionBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  navActionText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  navActionTextPrimary: { color: '#fff' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing['2xl'], paddingBottom: 80, gap: spacing.md },

  // ── Hero info card ─────────────────────────────────────────────────────────
  infoCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  programTitle: { fontSize: fontSize.xl, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  programDesc: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.72)', lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  metaText: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.65)' },
  metaDurationPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  metaDurationText: { fontSize: fontSize.xs, color: '#fff', fontWeight: '700' },
  badge: { borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'capitalize' },

  // ── Section title ───────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: -spacing.xs,
  },

  // ── Day card ────────────────────────────────────────────────────────────────
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  dayCardDone: { borderColor: colors.success },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  dayNumberBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dayNumberBadgeDone: { backgroundColor: colors.success },
  dayNumberText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.accent },
  dayNumberTextDone: { color: '#fff' },
  dayHeaderCenter: { flex: 1 },
  dayTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  daySubtitle: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', marginTop: 1 },
  dayChevron: { fontSize: fontSize.xs, color: colors.textMuted },

  // kept for old refs:
  dayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  completedBadge: {
    backgroundColor: `${colors.success}18`,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  completedBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },

  dayBody: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  noExText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // ── Mark complete button ─────────────────────────────────────────────────
  markCompleteBtn: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  markCompleteBtnDone: {
    backgroundColor: colors.successFaded,
    borderWidth: 1.5,
    borderColor: colors.success,
    shadowOpacity: 0,
    elevation: 0,
  },
  markCompleteBtnText: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },
  markCompleteBtnTextDone: { color: colors.success },

  // ── Exercise card ──────────────────────────────────────────────────────────
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exerciseIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  exerciseIndexText: { fontSize: fontSize.xs, fontWeight: '800', color: '#fff' },
  exerciseName: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  exerciseMeta: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  statChip: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statChipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  exerciseNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  videoLink: {
    marginTop: spacing.xs,
    backgroundColor: '#FFF1F0',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  videoLinkText: { fontSize: fontSize.xs, fontWeight: '700', color: '#DC2626' },

  // ── Client feedback ───────────────────────────────────────────────────────
  feedbackSection: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  feedbackSectionTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  feedbackCard: {
    backgroundColor: colors.accentFaded,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  feedbackText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  feedbackEditText: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '700' },
  feedbackAddBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accentFaded,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  feedbackAddText: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '700' },
  feedbackInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.accent,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  feedbackActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    justifyContent: 'flex-end',
  },
  feedbackCancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  feedbackCancelText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  feedbackSaveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  feedbackSaveBtnDisabled: { opacity: 0.55 },
  feedbackSaveText: { fontSize: fontSize.sm, color: '#fff', fontWeight: '700' },

  // legacy refs kept for coach header actions
  header: {},
  backText: {},
  headerActions: {},
  editHeaderBtn: {},
  editHeaderBtnText: {},
  assignHeaderBtn: {},
  assignHeaderBtnText: {},
});

// Superset-specific styles for the detail view
const detailStyles = StyleSheet.create({
  // Superset block wrapper
  supersetBlock: {
    borderWidth: 1.5,
    borderColor: SS_COLOR,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#FFF7ED',
    gap: 0,
  },
  supersetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: `${SS_COLOR}18`,
  },
  supersetHeaderLine: { flex: 1, height: 1, backgroundColor: `${SS_COLOR}50` },
  supersetHeaderPill: {
    backgroundColor: SS_COLOR,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  supersetHeaderText: { fontSize: fontSize.xs, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  // Exercises inside a superset card don't need their own border
  exerciseCardInSuperset: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: `${SS_COLOR}30`,
  },
  // Divider between two exercises inside a superset
  supersetDivider: {
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: `${SS_COLOR}10`,
  },
  supersetDividerText: { fontSize: fontSize.xs, color: SS_COLOR, fontWeight: '600' },
});
