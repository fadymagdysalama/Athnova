import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ExerciseLibraryDrawer } from '../../src/components/ExerciseLibraryDrawer';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { invokeEdgeFunction } from '../../src/lib/invokeEdgeFunction';
import { useExerciseLibraryStore } from '../../src/stores/exerciseLibraryStore';
import type { ExerciseTemplate } from '../../src/types';

const SS_COLOR = '#EA580C'; // superset accent – vibrant orange
const SS_BG = '#FFF7ED';
const getSupersetLetter = (group: number) =>
  String.fromCharCode(64 + ((group - 1) % 26) + 1); // 1→A, 2→B …
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '../../src/stores/programStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { ProgramDayWithExercises } from '../../src/types';

// ─── Step 1: Program Details ──────────────────────────────────────────────────
const PRESET_TAGS = ['strength', 'fat-loss', 'muscle-gain', 'cardio', 'beginner', 'intermediate', 'advanced', 'mobility', 'sport'];

function Step1({
  title, setTitle,
  description, setDescription,
  durationDays, setDurationDays,
  tags, setTags,
  isCoachOnly, setIsCoachOnly,
  onNext,
}: {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  durationDays: string; setDurationDays: (v: string) => void;
  tags: string[]; setTags: (v: string[]) => void;
  isCoachOnly: boolean; setIsCoachOnly: (v: boolean) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const days = Math.max(1, Math.min(365, parseInt(durationDays, 10) || 7));

  const nudgeDays = (delta: number) =>
    setDurationDays(String(Math.max(1, Math.min(365, days + delta))));

  const toggleTag = (tag: string) =>
    setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);

  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      {/* Program name */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('programs.programName')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('programs.programNamePlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
      </View>

      {/* Description */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('programs.description')}</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder={t('programs.descriptionPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Duration — stepper */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('programs.durationDays')}</Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => nudgeDays(-1)} activeOpacity={0.75}>
            <Text style={styles.stepperBtnText}>−</Text>
          </TouchableOpacity>
          <View style={styles.stepperValueWrap}>
            <Text style={styles.stepperValue}>{days}</Text>
            <Text style={styles.stepperUnit}>days</Text>
          </View>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => nudgeDays(1)} activeOpacity={0.75}>
            <Text style={styles.stepperBtnText}>+</Text>
          </TouchableOpacity>
          {/* quick presets */}
          {[7, 14, 28].map((preset) => (
            <TouchableOpacity
              key={preset}
              style={[styles.presetChip, days === preset && styles.presetChipActive]}
              onPress={() => setDurationDays(String(preset))}
            >
              <Text style={[styles.presetChipText, days === preset && styles.presetChipTextActive]}>
                {preset}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tags */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Tags</Text>
        <View style={styles.tagsWrap}>
          {PRESET_TAGS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.tagChip, active && styles.tagChipActive]}
                onPress={() => toggleTag(tag)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !title.trim() && styles.btnDisabled]}
        onPress={onNext}
        disabled={!title.trim()}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryBtnText}>{t('common.next')} →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Exercise row inside day ──────────────────────────────────────────────────
interface ExerciseDraft {
  key: string;
  exercise_name: string;
  sets: string;
  reps: string;
  rest_time: string;
  notes: string;
  video_url: string;
  superset_group: number | null;
  weight: string;
  isAiGenerated?: boolean;
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
      style={[styles.ssConnector, isLinked && styles.ssConnectorLinked]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[styles.ssLine, isLinked && styles.ssLineLinked]} />
      <View style={[styles.ssPill, isLinked && styles.ssPillLinked]}>
        <Text style={[styles.ssPillText, isLinked && styles.ssPillTextLinked]}>
          {isLinked ? `⚡ SS-${label}  ${t('programs.unlinkSuperset')}` : `+ ${t('programs.linkAsSuperset')}`}
        </Text>
      </View>
      <View style={[styles.ssLine, isLinked && styles.ssLineLinked]} />
    </TouchableOpacity>
  );
}

function ExerciseRow({
  ex,
  onChange,
  onRemove,
  supersetLabel,
  onAddToLibrary,
}: {
  ex: ExerciseDraft;
  onChange: (field: keyof ExerciseDraft, value: string) => void;
  onRemove: () => void;
  supersetLabel?: string;
  onAddToLibrary?: () => void;
}) {
  const { t } = useTranslation();
  const inSuperset = ex.superset_group !== null;
  return (
    <View style={[styles.exerciseRow, inSuperset && styles.exerciseRowSuperset, ex.isAiGenerated && styles.exerciseRowAi]}>
      {inSuperset && <View style={styles.ssSidebar} />}
      <View style={styles.exerciseRowInner}>
      <View style={styles.exerciseRowHeader}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder={t('programs.exerciseName')}
          placeholderTextColor={colors.textMuted}
          value={ex.exercise_name}
          onChangeText={(v) => onChange('exercise_name', v)}
        />
        {ex.isAiGenerated && !inSuperset && (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>✦ AI</Text>
          </View>
        )}
        {inSuperset && (
          <View style={styles.ssBadge}>
            <Text style={styles.ssBadgeText}>⚡ {supersetLabel}</Text>
          </View>
        )}
        <TouchableOpacity onPress={onRemove} style={styles.removeExBtn}>
          <Text style={styles.removeExText}>✕</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, { marginTop: spacing.xs }]}
        placeholder={t('programs.videoUrlPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={ex.video_url}
        onChangeText={(v) => onChange('video_url', v)}
        autoCapitalize="none"
        keyboardType="url"
      />
      <View style={styles.exerciseMiniRow}>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.miniLabel}>{t('programs.sets')}</Text>
          <TextInput
            style={styles.inputMini}
            keyboardType="number-pad"
            placeholder="3"
            placeholderTextColor={colors.textMuted}
            value={ex.sets}
            onChangeText={(v) => onChange('sets', v)}
            maxLength={2}
          />
        </View>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.miniLabel}>{t('programs.reps')}</Text>
          <TextInput
            style={styles.inputMini}
            placeholder="10-12"
            placeholderTextColor={colors.textMuted}
            value={ex.reps}
            onChangeText={(v) => onChange('reps', v)}
          />
        </View>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.miniLabel}>{t('programs.restTime')}</Text>
          <TextInput
            style={styles.inputMini}
            placeholder={t('programs.restTimePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={ex.rest_time}
            onChangeText={(v) => onChange('rest_time', v)}
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
          onChangeText={(v) => onChange('weight', v)}
        />
      </View>
      <TextInput
        style={[styles.input, { marginTop: spacing.xs }]}
        placeholder={t('programs.notesPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={ex.notes}
        onChangeText={(v) => onChange('notes', v)}
      />
      {onAddToLibrary && (
        <TouchableOpacity
          style={[styles.addToLibraryBtn, !ex.exercise_name.trim() && styles.addToLibraryBtnDisabled]}
          onPress={onAddToLibrary}
          disabled={!ex.exercise_name.trim()}
          activeOpacity={0.7}
        >
          <Text style={styles.addToLibraryBtnText}>📥 {t('library.saveToLibrary')}</Text>
        </TouchableOpacity>
      )}
      </View>
    </View>
  );
}

// ─── Step 2: Day Builder ──────────────────────────────────────────────────────
interface DayDraft {
  key: string;
  day_number: number;
  exercises: ExerciseDraft[];
}

function Step2({
  durationDays,
  days,
  setDays,
  onSave,
  saving,
  showAlert,
}: {
  durationDays: number;
  days: DayDraft[];
  setDays: (v: DayDraft[]) => void;
  onSave: () => void;
  saving: boolean;
  showAlert: (opts: { title: string; message: string }) => void;
}) {
  const { t } = useTranslation();
  const { add: addToLibrary, exercises: libraryExercises, fetch: fetchLibrary } = useExerciseLibraryStore();
  const [expandedDay, setExpandedDay] = useState<string | null>(days[0]?.key ?? null);
  const [libraryDayKey, setLibraryDayKey] = useState<string | null>(null);

  // Ensure library is loaded for AI exercise name matching
  useEffect(() => { fetchLibrary(); }, []);

  // Find a matching exercise in the library by name (case-insensitive exact match)
  const matchFromLibrary = React.useCallback((name: string) => {
    const n = name.toLowerCase().trim();
    return libraryExercises.find(e => e.name.toLowerCase().trim() === n) ?? null;
  }, [libraryExercises]);

  const handleAddToLibrary = async (ex: ExerciseDraft) => {
    if (!ex.exercise_name.trim()) return;
    const { error } = await addToLibrary({
      name: ex.exercise_name.trim(),
      category: 'other',
      video_url: ex.video_url.trim(),
      default_notes: ex.notes.trim(),
      default_sets: ex.sets.trim(),
      default_reps: ex.reps.trim(),
    });
    if (error) {
      showAlert({ title: t('common.error'), message: error });
    } else {
      showAlert({ title: t('library.saveToLibrary'), message: `"${ex.exercise_name.trim()}" has been added to your library.` });
    }
  };
  const [aiInputDayKey, setAiInputDayKey] = useState<string | null>(null);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Whole-program AI state ────────────────────────────────────────────────
  const [showAiProgram, setShowAiProgram] = useState(false);
  const [aiProgramText, setAiProgramText] = useState('');
  const [aiProgramLoading, setAiProgramLoading] = useState(false);
  const [aiProgramError, setAiProgramError] = useState<string | null>(null);

  const handleAiProgramFill = async () => {
    if (!aiProgramText.trim()) return;
    setAiProgramLoading(true);
    setAiProgramError(null);
    const { data, error } = await invokeEdgeFunction<{
      program: Array<{
        day_number: number;
        exercises: Array<{
          exercise_name: string;
          sets: number;
          reps: string;
          rest_time: string;
          weight: string;
          notes: string;
          superset_group: number | null;
        }>;
      }>;
    }>('ai-parse-program', { text: aiProgramText.trim() });
    setAiProgramLoading(false);

    if (error || !data?.program?.length) {
      setAiProgramError(error ?? 'No program data returned. Try describing each day more clearly.');
      return;
    }

    const now = Date.now();
    const updatedDays = days.map((d) => {
      const parsed = data.program.find((p) => p.day_number === d.day_number);
      if (!parsed || !parsed.exercises.length) return d;
      return {
        ...d,
        exercises: parsed.exercises.map((e, i) => {
          const lib = matchFromLibrary(e.exercise_name);
          return {
            key: `ai-prog-${now}-${d.day_number}-${i}`,
            exercise_name: e.exercise_name,
            sets: lib?.default_sets ?? String(e.sets),
            reps: lib?.default_reps ?? e.reps,
            rest_time: e.rest_time,
            notes: lib?.default_notes ?? e.notes,
            video_url: lib?.video_url ?? '',
            superset_group: e.superset_group,
            weight: e.weight,
            isAiGenerated: !lib,
          };
        }),
      };
    });

    setDays(updatedDays);
    const filledCount = data.program.length;
    setAiProgramText('');
    setShowAiProgram(false);
    // Auto-expand first day
    if (updatedDays.length > 0) setExpandedDay(updatedDays[0].key);
    showAlert({ title: '✦ Done', message: `AI filled ${filledCount} day${filledCount !== 1 ? 's' : ''} of your program.` });
  };

  const handleAiFill = async (dayKey: string) => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError(null);
    const currentDay = days.find((d) => d.key === dayKey);
    const hasExercises = (currentDay?.exercises ?? []).length > 0;
    let requestText = aiText.trim();
    if (hasExercises && currentDay) {
      const existingJson = JSON.stringify(currentDay.exercises.map((e) => ({
        exercise_name: e.exercise_name,
        sets: parseInt(e.sets, 10) || 3,
        reps: e.reps,
        rest_time: e.rest_time,
        weight: e.weight,
        notes: e.notes,
        superset_group: e.superset_group,
      })));
      requestText = `CURRENT EXERCISES (JSON):\n${existingJson}\n---\nINSTRUCTION: ${aiText.trim()}`;
    }
    const { data, error } = await invokeEdgeFunction<{ exercises: Array<{
      exercise_name: string;
      sets: number;
      reps: string;
      rest_time: string;
      weight: string;
      notes: string;
      superset_group: number | null;
    }> }>('ai-parse-workout', { text: requestText });
    setAiLoading(false);
    if (error || !data?.exercises?.length) {
      setAiError(error ?? 'No exercises parsed. Try describing the workout in more detail.');
      return;
    }
    const now = Date.now();
    const newExercises: ExerciseDraft[] = data.exercises.map((e, i) => {
      const lib = matchFromLibrary(e.exercise_name);
      return {
        key: `ai-${now}-${i}`,
        exercise_name: e.exercise_name,
        sets: lib?.default_sets ?? String(e.sets),
        reps: lib?.default_reps ?? e.reps,
        rest_time: e.rest_time,
        notes: lib?.default_notes ?? e.notes,
        video_url: lib?.video_url ?? '',
        superset_group: e.superset_group,
        weight: e.weight,
        isAiGenerated: !lib,
      };
    });
    setDays(days.map((d) => d.key === dayKey ? { ...d, exercises: newExercises } : d));
    setAiText('');
    setAiInputDayKey(null);
  };

  const addExercise = (dayKey: string, template?: ExerciseTemplate) => {
    const newEx: ExerciseDraft = {
      key: `${Date.now()}`,
      exercise_name: template?.name ?? '',
      sets: template?.default_sets ?? '3',
      reps: template?.default_reps ?? '10',
      rest_time: '60s',
      notes: template?.default_notes ?? '',
      video_url: template?.video_url ?? '',
      superset_group: null,
      weight: '',
    };
    setDays(days.map((d) => d.key === dayKey ? { ...d, exercises: [...d.exercises, newEx] } : d));
  };

  const updateExercise = (dayKey: string, exKey: string, field: keyof ExerciseDraft, value: string) => {
    setDays(days.map((d) => d.key !== dayKey ? d : {
      ...d,
      exercises: d.exercises.map((e) => e.key === exKey ? { ...e, [field]: value } : e),
    }));
  };

  const removeExercise = (dayKey: string, exKey: string) => {
    setDays(days.map((d) => d.key !== dayKey ? d : {
      ...d,
      exercises: d.exercises.filter((e) => e.key !== exKey),
    }));
  };

  const toggleSupersetLink = (dayKey: string, exIndex: number) => {
    const day = days.find((d) => d.key === dayKey);
    if (!day || exIndex >= day.exercises.length - 1) return;
    const ex1 = day.exercises[exIndex];
    const ex2 = day.exercises[exIndex + 1];

    if (ex1.superset_group !== null && ex1.superset_group === ex2.superset_group) {
      // They are already linked – unlink
      const groupMembers = day.exercises.filter((e) => e.superset_group === ex1.superset_group);
      setDays(days.map((d) => d.key !== dayKey ? d : {
        ...d,
        exercises: groupMembers.length <= 2
          ? d.exercises.map((e) => e.superset_group === ex1.superset_group ? { ...e, superset_group: null } : e)
          : d.exercises.map((e) => e.key === ex2.key ? { ...e, superset_group: null } : e),
      }));
      return;
    }

    // Link them together
    let targetGroup = ex1.superset_group ?? ex2.superset_group;
    if (targetGroup === null) {
      const used = day.exercises.map((e) => e.superset_group).filter((g): g is number => g !== null);
      targetGroup = used.length > 0 ? Math.max(...used) + 1 : 1;
    }
    const group = targetGroup;
    setDays(days.map((d) => d.key !== dayKey ? d : {
      ...d,
      exercises: d.exercises.map((e, i) =>
        (i === exIndex || i === exIndex + 1) ? { ...e, superset_group: group } : e
      ),
    }));
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">

      {/* ── Whole-program AI button ── */}
      <TouchableOpacity
        style={[styles.aiProgramBannerBtn, showAiProgram && styles.aiProgramBannerBtnActive]}
        onPress={() => { setShowAiProgram((v) => !v); setAiProgramError(null); }}
        activeOpacity={0.8}
      >
        <Text style={[styles.aiProgramBannerIcon, showAiProgram && { color: '#fff' }]}>✦</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.aiProgramBannerTitle, showAiProgram && { color: '#fff' }]}>AI — Fill Entire Program</Text>
          <Text style={[styles.aiProgramBannerSub, showAiProgram && { color: '#E9D5FF' }]}>Describe all {durationDays} days at once</Text>
        </View>
        <Text style={[styles.aiProgramBannerChevron, showAiProgram && { color: '#fff' }]}>{showAiProgram ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {showAiProgram && (
        <View style={styles.aiProgramPanel}>
          <Text style={styles.aiPanelTitle}>✦ Describe your full program</Text>
          <Text style={styles.aiPanelSubtitle}>Label each day: "Day 1: chest bench press 4x10...", "Day 2: legs..."</Text>
          <TextInput
            style={[styles.input, styles.aiTextarea, styles.aiProgramTextarea]}
            placeholder={`e.g.\nDay 1: bench press 4x10, incline dumbbell 3x12\nDay 2: squat 5x8 wazn 60kg, leg press 3x15\nDay 3: rest`}
            placeholderTextColor={colors.textMuted}
            value={aiProgramText}
            onChangeText={(v) => { setAiProgramText(v); setAiProgramError(null); }}
            multiline
            numberOfLines={6}
            autoFocus
            textAlignVertical="top"
          />
          {aiProgramError && <Text style={styles.aiError}>{aiProgramError}</Text>}
          <View style={styles.aiActions}>
            <TouchableOpacity
              style={styles.aiCancelBtn}
              onPress={() => { setShowAiProgram(false); setAiProgramText(''); setAiProgramError(null); }}
            >
              <Text style={styles.aiCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.aiGenerateBtn, (aiProgramLoading || !aiProgramText.trim()) && styles.btnDisabled]}
              onPress={handleAiProgramFill}
              disabled={aiProgramLoading || !aiProgramText.trim()}
            >
              {aiProgramLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.aiGenerateBtnText}>✦ Generate All Days</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {days.map((day) => (
        <View key={day.key} style={styles.dayCard}>
          <TouchableOpacity
            style={styles.dayHeader}
            onPress={() => setExpandedDay(expandedDay === day.key ? null : day.key)}
          >
            <View style={styles.dayNumCircle}>
              <Text style={styles.dayNumText}>{day.day_number}</Text>
            </View>
            <Text style={styles.dayTitle}>{t('programs.day', { number: day.day_number })}</Text>
            <Text style={styles.dayMeta}>
              {day.exercises.length} {t('programs.exercises')}
            </Text>
            <Text style={styles.dayChevron}>{expandedDay === day.key ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {expandedDay === day.key && (
            <View style={styles.dayBody}>
              {day.exercises.length === 0 && (
                <Text style={styles.noExText}>{t('programs.noExercises')}</Text>
              )}
              {day.exercises.map((ex, exIdx) => (
                <React.Fragment key={ex.key}>
                  <ExerciseRow
                    ex={ex}
                    supersetLabel={
                      ex.superset_group !== null ? getSupersetLetter(ex.superset_group) : undefined
                    }
                    onChange={(field, value) => updateExercise(day.key, ex.key, field, value)}
                    onRemove={() => removeExercise(day.key, ex.key)}
                    onAddToLibrary={() => handleAddToLibrary(ex)}
                  />
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
                      onToggle={() => toggleSupersetLink(day.key, exIdx)}
                    />
                  )}
                </React.Fragment>
              ))}
              {/* AI fill input panel */}
              {aiInputDayKey === day.key && (() => {
                const isRefinement = day.exercises.length > 0;
                return (
                  <View style={styles.aiPanel}>
                    <Text style={styles.aiPanelTitle}>
                      {isRefinement ? '✦ Refine this day' : '✦ Describe the workout'}
                    </Text>
                    <Text style={styles.aiPanelSubtitle}>
                      {isRefinement
                        ? 'Describe what to change — AI updates only what you ask'
                        : 'Arabic, English, or both — AI will structure it for you'}
                    </Text>
                    <TextInput
                      style={[styles.input, styles.aiTextarea]}
                      placeholder={isRefinement
                        ? 'e.g. change exercise 1 to barbell row 5x8, increase bench press weight to 40kg...'
                        : 'e.g. bench press 4x10 wazn 20kg rayyah 30 sania, ba3diha superset dumbbell fly 30kg 4x10'}
                      placeholderTextColor={colors.textMuted}
                      value={aiText}
                      onChangeText={(v) => { setAiText(v); setAiError(null); }}
                      multiline
                      numberOfLines={4}
                      autoFocus
                      textAlignVertical="top"
                    />
                    {aiError && <Text style={styles.aiError}>{aiError}</Text>}
                    <View style={styles.aiActions}>
                      <TouchableOpacity
                        style={styles.aiCancelBtn}
                        onPress={() => { setAiInputDayKey(null); setAiText(''); setAiError(null); }}
                      >
                        <Text style={styles.aiCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.aiGenerateBtn, (aiLoading || !aiText.trim()) && styles.btnDisabled]}
                        onPress={() => handleAiFill(day.key)}
                        disabled={aiLoading || !aiText.trim()}
                      >
                        {aiLoading
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.aiGenerateBtnText}>{isRefinement ? '✦ Refine' : '✦ Generate'}</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}
              <View style={styles.addExRow}>
                <TouchableOpacity
                  style={[styles.addExBtn, { flex: 1 }]}
                  onPress={() => addExercise(day.key)}
                >
                  <Text style={styles.addExBtnText}>{t('programs.addExercise')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.libraryBtn}
                  onPress={() => setLibraryDayKey(day.key)}
                >
                  <Text style={styles.libraryBtnText}>🗂️ {t('library.fromLibrary')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.aiBtn, aiInputDayKey === day.key && styles.aiBtnActive]}
                  onPress={() => {
                    if (aiInputDayKey === day.key) {
                      setAiInputDayKey(null); setAiText(''); setAiError(null);
                    } else {
                      setAiInputDayKey(day.key);
                    }
                  }}
                >
                  <Text style={[styles.aiBtnText, aiInputDayKey === day.key && styles.aiBtnTextActive]}>✦ AI</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ))}

      <ExerciseLibraryDrawer
        visible={libraryDayKey !== null}
        onClose={() => setLibraryDayKey(null)}
        onSelect={(template) => {
          if (libraryDayKey) addExercise(libraryDayKey, template);
        }}
      />

      <TouchableOpacity
        style={[styles.primaryBtn, saving && styles.btnDisabled]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text style={styles.primaryBtnText}>{t('programs.saveProgram')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Root screen ──────────────────────────────────────────────────────────────
export default function CreateProgramScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { clientPreselect, offlineClientPreselect, clientName } = useLocalSearchParams<{
    clientPreselect?: string;
    offlineClientPreselect?: string;
    clientName?: string;
  }>();
  const { createProgram, addDay, addExercise, assignProgram, assignProgramToOffline } = useProgramStore();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const { alertProps, showAlert } = useAppAlert();

  // Step 1 state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [tags, setTags] = useState<string[]>([]);
  const [isCoachOnly, setIsCoachOnly] = useState(false);

  // Step 2 state
  const [days, setDays] = useState<DayDraft[]>([]);

  const handleNext = () => {
    const count = Math.max(1, Math.min(365, parseInt(durationDays, 10) || 7));
    setDurationDays(String(count));
    const initialDays: DayDraft[] = Array.from({ length: count }, (_, i) => ({
      key: `day-${i + 1}`,
      day_number: i + 1,
      exercises: [],
    }));
    setDays(initialDays);
    setStep(2);
  };

  const handleSave = async () => {
    setSaving(true);
    const count = parseInt(durationDays, 10) || 7;

    const { id: programId, error: progErr } = await createProgram({
      title: title.trim(),
      description: description.trim(),
      duration_days: count,
      type: 'private',
      tags,
      is_coach_only: isCoachOnly,
    });

    if (progErr || !programId) {
      setSaving(false);
      return showAlert({ title: t('common.error'), message: progErr ?? 'Failed to create program' });
    }

    // Add days + exercises
    for (const day of days) {
      const { id: dayId, error: dayErr } = await addDay(programId, day.day_number);
      if (dayErr || !dayId) continue;

      for (let i = 0; i < day.exercises.length; i++) {
        const ex = day.exercises[i];
        if (!ex.exercise_name.trim()) continue;
        await addExercise(dayId, {
          exercise_name: ex.exercise_name.trim(),
          sets: parseInt(ex.sets, 10) || 1,
          reps: ex.reps.trim() || '10',
          rest_time: ex.rest_time.trim(),
          notes: ex.notes.trim(),
          video_url: ex.video_url.trim(),
          order_index: i,
          superset_group: ex.superset_group ?? null,
          weight: ex.weight.trim() || null,
        });
      }
    }

    // Auto-assign to the preselected client and go straight back
    if (offlineClientPreselect) {
      await assignProgramToOffline(programId, offlineClientPreselect, true);
    } else if (clientPreselect) {
      await assignProgram(programId, clientPreselect, true);
    }
    setSaving(false);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerNav}>
          <TouchableOpacity style={styles.backBtn} onPress={() => (step === 1 ? router.back() : setStep(1))}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('programs.createProgram')}</Text>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>{step} / 2</Text>
          </View>
        </View>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: step === 1 ? '50%' : '100%' }]} />
        </View>
      </View>

      {step === 1 ? (
        <Step1
          title={title} setTitle={setTitle}
          description={description} setDescription={setDescription}
          durationDays={durationDays} setDurationDays={setDurationDays}
          tags={tags} setTags={setTags}
          isCoachOnly={isCoachOnly} setIsCoachOnly={setIsCoachOnly}
          onNext={handleNext}
        />
      ) : (
        <Step2
          durationDays={parseInt(durationDays, 10) || 7}
          days={days}
          setDays={setDays}
          onSave={handleSave}
          saving={saving}
          showAlert={showAlert}
        />
      )}
      <AppAlert {...alertProps} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingTop: 56,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.primary },
  headerTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  stepBadge: {
    backgroundColor: colors.accentFaded,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  stepBadgeText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

  progressTrack: { height: 4, backgroundColor: colors.borderLight },
  progressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },

  // ── Step content ─────────────────────────────────────────────────────────────
  stepContent: { padding: spacing['2xl'], paddingBottom: 120, gap: spacing['2xl'] },

  fieldGroup: { gap: spacing.sm },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, letterSpacing: 0.1 },

  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.md },

  // ── Difficulty cards ─────────────────────────────────────────────────────────
  diffRow: { flexDirection: 'row', gap: spacing.sm },
  diffCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 6,
  },
  diffIcon: { fontSize: 24 },
  diffLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },

  // ── Duration stepper ─────────────────────────────────────────────────────────
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 24 },
  stepperValueWrap: { alignItems: 'center', minWidth: 56 },
  stepperValue: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text, lineHeight: 30 },
  stepperUnit: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },

  presetChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  presetChipActive: { borderColor: colors.primary, backgroundColor: colors.accentFaded },
  presetChipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  presetChipTextActive: { color: colors.primary },

  // ── Primary button ───────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  btnDisabled: { opacity: 0.35 },
  primaryBtnText: { fontSize: fontSize.md, fontWeight: '800', color: colors.textInverse, letterSpacing: 0.3 },

  // ── Day cards ────────────────────────────────────────────────────────────────
  dayCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  dayNumCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },
  dayTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  dayMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  dayChevron: { fontSize: 10, color: colors.textMuted },
  dayBody: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  noExText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // ── Exercise rows ─────────────────────────────────────────────────────────────
  exerciseRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
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
  exerciseRowInner: { padding: spacing.md, gap: spacing.sm },
  exerciseRowHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  ssBadge: {
    backgroundColor: SS_COLOR,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ssBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: '#fff' },
  exerciseMiniRow: { flexDirection: 'row', gap: spacing.sm },
  miniLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, marginBottom: 2 },
  inputMini: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlign: 'center',
  },
  removeExBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(220,38,38,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeExText: { fontSize: 13, color: colors.error, fontWeight: '700' },
  addToLibraryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.accentFaded,
    borderWidth: 1,
    borderColor: colors.accent,
    marginTop: spacing.xs,
  },
  addToLibraryBtnText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.accent },
  addToLibraryBtnDisabled: { opacity: 0.3 },

  // ── Weight unit toggle ─────────────────────────────────────────────────────
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
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  unitBtnActive: { backgroundColor: colors.primary },
  unitBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  unitBtnTextActive: { color: '#fff' },

  // ── Add exercise button + library row ────────────────────────────────────────
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

  // ── Superset connector ────────────────────────────────────────────────────────
  ssConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  ssConnectorLinked: {},
  ssLine: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  ssLineLinked: { backgroundColor: SS_COLOR },
  ssPill: {
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.surface,
  },
  ssPillLinked: {
    backgroundColor: `${SS_COLOR}18`,
    borderColor: SS_COLOR,
    borderStyle: 'solid',
  },
  ssPillText: { fontSize: fontSize.xs, fontWeight: '500', color: colors.textMuted },
  ssPillTextLinked: { color: SS_COLOR, fontWeight: '700' },

  // ── Tags ──────────────────────────────────────────────────────────────────────
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tagChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tagChipText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  tagChipTextActive: { color: '#fff' },

  // ── AI fill panel ────────────────────────────────────────────────────────────
  aiBtn: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
  },
  aiBtnActive: {
    backgroundColor: '#7C3AED',
  },
  aiBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#7C3AED',
  },
  aiBtnTextActive: {
    color: '#fff',
  },
  aiPanel: {
    backgroundColor: '#F5F3FF',
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    padding: spacing.md,
    gap: spacing.sm,
  },
  aiPanelTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#5B21B6',
  },
  aiPanelSubtitle: {
    fontSize: fontSize.xs,
    color: '#7C3AED',
    marginTop: -4,
  },
  aiTextarea: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
    borderColor: '#7C3AED',
    backgroundColor: '#fff',
  },
  aiError: {
    fontSize: fontSize.xs,
    color: colors.error,
    fontWeight: '600',
  },
  aiActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  aiCancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    backgroundColor: '#fff',
  },
  aiCancelBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#7C3AED',
  },
  aiGenerateBtn: {
    flex: 2,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    backgroundColor: '#7C3AED',
  },
  aiGenerateBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
  // ── Whole-program AI banner + panel ──────────────────────────────────────
  aiProgramBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F5F3FF',
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  aiProgramBannerBtnActive: {
    backgroundColor: '#7C3AED',
  },
  aiProgramBannerIcon: {
    fontSize: 20,
    color: '#7C3AED',
    fontWeight: '800',
  },
  aiProgramBannerTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#5B21B6',
  },
  aiProgramBannerSub: {
    fontSize: fontSize.xs,
    color: '#7C3AED',
    marginTop: 1,
  },
  aiProgramBannerChevron: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '700',
  },
  aiProgramPanel: {
    backgroundColor: '#F5F3FF',
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: -spacing.md,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  aiProgramTextarea: {
    minHeight: 120,
  },
  // AI-generated exercise row highlight
  exerciseRowAi: {
    borderColor: '#7C3AED',
    borderStyle: 'solid',
  },
  aiBadge: {
    backgroundColor: '#7C3AED',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  aiBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Coach-only toggle ─────────────────────────────────────────────────────────
  coachOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
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
});
