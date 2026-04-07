import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SS_COLOR = '#EA580C';
const SS_BG = '#FFF7ED';
const getSupersetLetter = (group: number) =>
  String.fromCharCode(64 + ((group - 1) % 26) + 1);
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '../../src/stores/programStore';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { ExerciseLibraryDrawer } from '../../src/components/ExerciseLibraryDrawer';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import type { ExerciseTemplate } from '../../src/types';

interface ExerciseDraft {
  id: string | null; // null = newly added, not yet in DB
  key: string;
  exercise_name: string;
  sets: string;
  reps: string;
  rest_time: string;
  notes: string;
  video_url: string;
  order_index: number;
  superset_group: number | null;
  weight: string;
}

interface DayDraft {
  id: string;
  day_number: number;
  exercises: ExerciseDraft[];
}

function moveItem<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (toIndex < 0 || toIndex >= arr.length) return arr;
  const result = [...arr];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return result;
}

// ─── Superset connector shown between two adjacent exercise rows ──────────────
function SupersetConnector({
  isLinked,
  label,
  onToggle,
}: {
  isLinked: boolean;
  label?: string;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={[editStyles.ssConnector, isLinked && editStyles.ssConnectorLinked]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[editStyles.ssLine, isLinked && editStyles.ssLineLinked]} />
      <View style={[editStyles.ssPill, isLinked && editStyles.ssPillLinked]}>
        <Text style={[editStyles.ssPillText, isLinked && editStyles.ssPillTextLinked]}>
          {isLinked ? `⚡ SS-${label}  ${t('programs.unlinkSuperset')}` : `+ ${t('programs.linkAsSuperset')}`}
        </Text>
      </View>
      <View style={[editStyles.ssLine, isLinked && editStyles.ssLineLinked]} />
    </TouchableOpacity>
  );
}

export default function EditProgramScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    currentProgram, isLoading, fetchProgramWithDays,
    updateProgram, updateExercise, addExercise, deleteExercise,
  } = useProgramStore();

  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isCoachOnly, setIsCoachOnly] = useState(false);
  const [days, setDays] = useState<DayDraft[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [libraryDayId, setLibraryDayId] = useState<string | null>(null);
  const { alertProps, showAlert } = useAppAlert();

  useEffect(() => {
    if (id) fetchProgramWithDays(id);
  }, [id]);

  useEffect(() => {
    if (!currentProgram) return;
    setTitle(currentProgram.title);
    setDescription(currentProgram.description ?? '');
    setIsCoachOnly(!!(currentProgram as any).is_coach_only);
    const drafts: DayDraft[] = (currentProgram.days ?? []).map((day) => ({
      id: day.id,
      day_number: day.day_number,
      exercises: day.exercises.map((ex, i) => ({
        id: ex.id,
        key: ex.id,
        exercise_name: ex.exercise_name,
        sets: String(ex.sets),
        reps: ex.reps,
        rest_time: (ex as any).rest_time ?? '',
        notes: (ex as any).notes ?? '',
        video_url: (ex as any).video_url ?? '',
        order_index: (ex as any).order_index ?? i,
        superset_group: (ex as any).superset_group ?? null,
        weight: String((ex as any).weight ?? ''),
      })),
    }));
    setDays(drafts);
    if (drafts.length) setExpandedDay(drafts[0].id);
  }, [currentProgram?.id]);

  const updateLocal = (dayId: string, exKey: string, field: keyof ExerciseDraft, value: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id !== dayId ? d : {
          ...d,
          exercises: d.exercises.map((e) => e.key !== exKey ? e : { ...e, [field]: value }),
        }
      )
    );
  };

  const addLocal = (dayId: string, template?: ExerciseTemplate) => {
    const newEx: ExerciseDraft = {
      id: null,
      key: `new-${Date.now()}`,
      exercise_name: template?.name ?? '',
      sets: template?.default_sets ?? '3',
      reps: template?.default_reps ?? '10',
      rest_time: '60s',
      notes: template?.default_notes ?? '',
      video_url: template?.video_url ?? '',
      order_index: 0,
      superset_group: null,
      weight: '',
    };
    setDays((prev) =>
      prev.map((d) => d.id !== dayId ? d : { ...d, exercises: [...d.exercises, newEx] })
    );
  };

  const removeLocal = async (dayId: string, exKey: string, exId: string | null) => {
    if (exId) {
      const { error } = await deleteExercise(exId);
      if (error) { showAlert({ title: t('common.error'), message: error }); return; }
    }
    setDays((prev) =>
      prev.map((d) =>
        d.id !== dayId ? d : { ...d, exercises: d.exercises.filter((e) => e.key !== exKey) }
      )
    );
  };

  // Move an exercise up or down within a day
  const moveExercise = (dayId: string, exKey: string, direction: 'up' | 'down') => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const idx = d.exercises.findIndex((e) => e.key === exKey);
        const toIdx = direction === 'up' ? idx - 1 : idx + 1;
        return { ...d, exercises: moveItem(d.exercises, idx, toIdx) };
      })
    );
  };

  const toggleSupersetLink = (dayId: string, exIndex: number) => {
    setDays((prev) => {
      const day = prev.find((d) => d.id === dayId);
      if (!day || exIndex >= day.exercises.length - 1) return prev;
      const ex1 = day.exercises[exIndex];
      const ex2 = day.exercises[exIndex + 1];

      if (ex1.superset_group !== null && ex1.superset_group === ex2.superset_group) {
        const groupMembers = day.exercises.filter((e) => e.superset_group === ex1.superset_group);
        return prev.map((d) => d.id !== dayId ? d : {
          ...d,
          exercises: groupMembers.length <= 2
            ? d.exercises.map((e) => e.superset_group === ex1.superset_group ? { ...e, superset_group: null } : e)
            : d.exercises.map((e) => e.key === ex2.key ? { ...e, superset_group: null } : e),
        });
      }

      let targetGroup = ex1.superset_group ?? ex2.superset_group;
      if (targetGroup === null) {
        const used = day.exercises.map((e) => e.superset_group).filter((g): g is number => g !== null);
        targetGroup = used.length > 0 ? Math.max(...used) + 1 : 1;
      }
      const group = targetGroup;
      return prev.map((d) => d.id !== dayId ? d : {
        ...d,
        exercises: d.exercises.map((e, i) =>
          (i === exIndex || i === exIndex + 1) ? { ...e, superset_group: group } : e
        ),
      });
    });
  };

  // Move a day up or down (local only – saved when pressing Save)
  const moveDay = (dayId: string, direction: 'up' | 'down') => {
    setDays((prev) => {
      const idx = prev.findIndex((d) => d.id === dayId);
      const toIdx = direction === 'up' ? idx - 1 : idx + 1;
      const reordered = moveItem(prev, idx, toIdx);
      // Reassign day_numbers based on new order
      return reordered.map((d, i) => ({ ...d, day_number: i + 1 }));
    });
  };

  const handleSave = async () => {
    if (!title.trim()) { showAlert({ title: t('common.error'), message: t('programs.programNameRequired') }); return; }
    setSaving(true);

    const { error: progErr } = await updateProgram(id!, { title: title.trim(), description: description.trim(), is_coach_only: isCoachOnly });
    if (progErr) { setSaving(false); showAlert({ title: t('common.error'), message: progErr }); return; }

    for (const day of days) {
      // Persist reordered day_number
      await supabase.from('program_days').update({ day_number: day.day_number }).eq('id', day.id);

      for (let i = 0; i < day.exercises.length; i++) {
        const ex = day.exercises[i];
        const data = {
          exercise_name: ex.exercise_name.trim(),
          sets: parseInt(ex.sets, 10) || 1,
          reps: ex.reps.trim() || '10',
          rest_time: ex.rest_time.trim(),
          notes: ex.notes.trim(),
          video_url: ex.video_url.trim(),
          order_index: i,
          superset_group: ex.superset_group ?? null,
          weight: ex.weight.trim() || null,
        };
        if (!data.exercise_name) continue;
        if (ex.id) {
          await updateExercise(ex.id, data);
        } else {
          const { id: newId } = await addExercise(day.id, data);
          if (newId) {
            setDays((prev) =>
              prev.map((d) =>
                d.id !== day.id ? d : {
                  ...d,
                  exercises: d.exercises.map((e) => e.key === ex.key ? { ...e, id: newId } : e),
                }
              )
            );
          }
        }
      }
    }

    setSaving(false);
    router.back();
  };

  if (isLoading || !currentProgram) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        {/* Navbar */}
        <View style={styles.navbar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>{t('programs.editProgram')}</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>{t('common.save')}</Text>
            }
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Metadata */}
        <Text style={styles.sectionLabel}>{t('programs.step1')}</Text>
        <View style={styles.metaCard}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('programs.programName')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('programs.description')}</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        {/* Days & exercises */}
        <Text style={styles.sectionLabel}>{t('programs.step2')}</Text>
        {days.map((day, dayIdx) => (
          <View key={day.id} style={styles.dayCard}>
            {/* Day header with reorder controls */}
            <View style={styles.dayHeader}>
              <View style={styles.dayReorderCol}>
                <TouchableOpacity
                  style={[styles.reorderBtn, dayIdx === 0 && styles.reorderBtnDisabled]}
                  onPress={() => moveDay(day.id, 'up')}
                  disabled={dayIdx === 0}
                >
                  <Text style={styles.reorderBtnText}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reorderBtn, dayIdx === days.length - 1 && styles.reorderBtnDisabled]}
                  onPress={() => moveDay(day.id, 'down')}
                  disabled={dayIdx === days.length - 1}
                >
                  <Text style={styles.reorderBtnText}>▼</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.dayHeaderContent}
                onPress={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                activeOpacity={0.8}
              >
                <View style={styles.dayNumberBadge}>
                  <Text style={styles.dayNumberText}>{day.day_number}</Text>
                </View>
                <View style={styles.dayHeaderCenter}>
                  <Text style={styles.dayTitle}>{t('programs.day', { number: day.day_number })}</Text>
                  <Text style={styles.dayMeta}>{day.exercises.length} {t('programs.exercises')}</Text>
                </View>
                <Text style={styles.dayChevron}>{expandedDay === day.id ? '▲' : '▼'}</Text>
              </TouchableOpacity>
            </View>

            {expandedDay === day.id && (
              <View style={styles.dayBody}>
                {day.exercises.length === 0 && (
                  <Text style={styles.noExText}>{t('programs.noExercises')}</Text>
                )}
                {day.exercises.map((ex, exIdx) => (
                  <React.Fragment key={ex.key}>
                  <View
                    style={[
                      styles.exerciseRow,
                      ex.superset_group !== null && editStyles.exerciseRowSuperset,
                    ]}
                  >
                    {ex.superset_group !== null && <View style={editStyles.ssSidebar} />}
                    {/* Reorder column */}
                    <View style={styles.exReorderCol}>
                      <TouchableOpacity
                        style={[styles.reorderBtn, exIdx === 0 && styles.reorderBtnDisabled]}
                        onPress={() => moveExercise(day.id, ex.key, 'up')}
                        disabled={exIdx === 0}
                      >
                        <Text style={styles.reorderBtnText}>▲</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.reorderBtn, exIdx === day.exercises.length - 1 && styles.reorderBtnDisabled]}
                        onPress={() => moveExercise(day.id, ex.key, 'down')}
                        disabled={exIdx === day.exercises.length - 1}
                      >
                        <Text style={styles.reorderBtnText}>▼</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Exercise fields */}
                    <View style={styles.exFieldsCol}>
                      {/* Name + superset badge + remove */}
                      <View style={styles.exerciseRowHeader}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder={t('programs.exerciseName')}
                          placeholderTextColor={colors.textMuted}
                          value={ex.exercise_name}
                          onChangeText={(v) => updateLocal(day.id, ex.key, 'exercise_name', v)}
                        />
                        {ex.superset_group !== null && (
                          <View style={editStyles.ssBadge}>
                            <Text style={editStyles.ssBadgeText}>⚡ {getSupersetLetter(ex.superset_group)}</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => removeLocal(day.id, ex.key, ex.id)}
                          style={styles.removeExBtn}
                        >
                          <Text style={styles.removeExText}>✕</Text>
                        </TouchableOpacity>
                      </View>

                      {/* YouTube URL */}
                      <TextInput
                        style={styles.input}
                        placeholder={t('programs.videoUrlPlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        value={ex.video_url}
                        onChangeText={(v) => updateLocal(day.id, ex.key, 'video_url', v)}
                        autoCapitalize="none"
                        keyboardType="url"
                      />

                      {/* Sets / Reps / Rest */}
                      <View style={styles.exerciseMiniRow}>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                          <Text style={styles.miniLabel}>{t('programs.sets')}</Text>
                          <TextInput
                            style={styles.inputMini}
                            keyboardType="number-pad"
                            value={ex.sets}
                            onChangeText={(v) => updateLocal(day.id, ex.key, 'sets', v)}
                            maxLength={2}
                          />
                        </View>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                          <Text style={styles.miniLabel}>{t('programs.reps')}</Text>
                          <TextInput
                            style={styles.inputMini}
                            value={ex.reps}
                            onChangeText={(v) => updateLocal(day.id, ex.key, 'reps', v)}
                          />
                        </View>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                          <Text style={styles.miniLabel}>{t('programs.restTime')}</Text>
                          <TextInput
                            style={styles.inputMini}
                            value={ex.rest_time}
                            onChangeText={(v) => updateLocal(day.id, ex.key, 'rest_time', v)}
                          />
                        </View>
                      </View>
                      <View style={[styles.fieldGroup, { marginTop: spacing.xs }]}>
                        <Text style={styles.miniLabel}>{t('programs.weight')}</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. 20kg, bodyweight, 2 x 10lbs"
                          placeholderTextColor={colors.textMuted}
                          value={ex.weight}
                          onChangeText={(v) => updateLocal(day.id, ex.key, 'weight', v)}
                        />
                      </View>

                      {/* Notes */}
                      <TextInput
                        style={[styles.input, { marginTop: spacing.xs }]}
                        placeholder={t('programs.notesPlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        value={ex.notes}
                        onChangeText={(v) => updateLocal(day.id, ex.key, 'notes', v)}
                      />
                    </View>
                  </View>
                  {exIdx < day.exercises.length - 1 && (
                    <SupersetConnector
                      isLinked={
                        ex.superset_group !== null &&
                        ex.superset_group === day.exercises[exIdx + 1].superset_group
                      }
                      label={
                        ex.superset_group !== null
                          ? getSupersetLetter(ex.superset_group)
                          : undefined
                      }
                      onToggle={() => toggleSupersetLink(day.id, exIdx)}
                    />
                  )}
                  </React.Fragment>
                ))}
                <View style={styles.addExRow}>
                  <TouchableOpacity
                    style={styles.addExBtn}
                    onPress={() => addLocal(day.id)}
                  >
                    <Text style={styles.addExBtnText}>+ {t('programs.addExercise')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.libraryBtn}
                    onPress={() => setLibraryDayId(day.id)}
                  >
                    <Text style={styles.libraryBtnText}>📚 {t('library.fromLibrary')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <ExerciseLibraryDrawer
        visible={libraryDayId !== null}
        onClose={() => setLibraryDayId(null)}
        onSelect={(template) => {
          if (libraryDayId) addLocal(libraryDayId, template);
        }}
      />
      <AppAlert {...alertProps} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Navbar ──────────────────────────────────────────────────────────────────
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accentFaded,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  backIcon: { fontSize: 26, color: colors.primary, fontWeight: '600', lineHeight: 30, marginLeft: -2 },
  navTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 68,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },

  // ── Layout ──────────────────────────────────────────────────────────────────
  content: { padding: spacing['2xl'], paddingBottom: 100, gap: spacing.lg },
  sectionLabel: {
    fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // ── Metadata card ─────────────────────────────────────────────────────────
  metaCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.md, color: colors.text,
  },
  textarea: { minHeight: 72, textAlignVertical: 'top' },

  // ── Coach-only / privacy toggle ───────────────────────────────────────────
  coachOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  coachOnlyRowActive: { borderColor: colors.primary, backgroundColor: colors.accentFaded },
  coachOnlyText: { flex: 1 },
  coachOnlyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  coachOnlyDesc: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  coachOnlyToggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  coachOnlyToggleOn: { backgroundColor: colors.primary },
  coachOnlyThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  coachOnlyThumbOn: { alignSelf: 'flex-end' },

  // Segmented difficulty control
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 3,
  },
  segmentItem: {
    flex: 1, alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  segmentText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: '#fff', fontWeight: '800' },

  // ── Day card ──────────────────────────────────────────────────────────────
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5, borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, paddingRight: spacing.md,
  },
  dayReorderCol: {
    width: 36, alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingLeft: spacing.sm,
  },
  dayHeaderContent: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, paddingLeft: spacing.sm,
  },
  dayNumberBadge: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.accentFaded,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dayNumberText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.accent },
  dayHeaderCenter: { flex: 1 },
  dayTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  dayMeta: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', marginTop: 1 },
  dayChevron: { fontSize: fontSize.xs, color: colors.textMuted },
  dayBody: {
    padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  noExText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // ── Exercise row ──────────────────────────────────────────────────────────
  exerciseRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'flex-start',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  exReorderCol: {
    width: 32, alignItems: 'center', justifyContent: 'center',
    gap: 2, paddingVertical: spacing.md, paddingLeft: spacing.xs,
  },
  exFieldsCol: { flex: 1, padding: spacing.md, gap: spacing.sm },
  exerciseRowHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  exerciseMiniRow: { flexDirection: 'row', gap: spacing.sm },
  miniLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputMini: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    fontSize: fontSize.sm, color: colors.text, textAlign: 'center',
  },
  removeExBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: `${colors.error}12`,
    alignItems: 'center', justifyContent: 'center',
  },
  removeExText: { fontSize: 14, color: colors.error, fontWeight: '700', lineHeight: 16 },
  addExRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addExBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addExBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  libraryBtn: {
    backgroundColor: colors.accentFaded,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  libraryBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.accent },

  // Reorder buttons
  reorderBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.accentFaded,
    alignItems: 'center', justifyContent: 'center',
  },
  reorderBtnDisabled: { opacity: 0.2 },
  reorderBtnText: { fontSize: 10, color: colors.primary, fontWeight: '800' },
});

// Superset-specific styles (kept separate to avoid style-object key collisions)
const editStyles = StyleSheet.create({
  exerciseRowSuperset: {
    borderColor: SS_COLOR,
    backgroundColor: SS_BG,
  },
  ssSidebar: {
    width: 4,
    backgroundColor: SS_COLOR,
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  ssBadge: {
    backgroundColor: SS_COLOR, borderRadius: 9999,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  ssBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  // Connector
  ssConnector: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  ssConnectorLinked: {},
  ssLine: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  ssLineLinked: { backgroundColor: SS_COLOR },
  ssPill: {
    borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed',
    borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.surface,
  },
  ssPillLinked: { backgroundColor: `${SS_COLOR}18`, borderColor: SS_COLOR, borderStyle: 'solid' },
  ssPillText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  ssPillTextLinked: { color: SS_COLOR, fontWeight: '700' },
  // Weight unit toggle
  unitToggle: {
    flexDirection: 'row',
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  unitBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center' as const,
    backgroundColor: colors.card,
  },
  unitBtnActive: { backgroundColor: colors.primary },
  unitBtnText: { fontSize: fontSize.xs, fontWeight: '700' as const, color: colors.textMuted },
  unitBtnTextActive: { color: '#fff' },
});
