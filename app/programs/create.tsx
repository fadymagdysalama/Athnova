import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '../../src/stores/programStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { ProgramDayWithExercises } from '../../src/types';

type Difficulty = 'beginner' | 'intermediate' | 'advanced';

// ─── Step 1: Program Details ──────────────────────────────────────────────────
function Step1({
  title, setTitle,
  description, setDescription,
  difficulty, setDifficulty,
  durationDays, setDurationDays,
  onNext,
}: {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  difficulty: Difficulty; setDifficulty: (v: Difficulty) => void;
  durationDays: string; setDurationDays: (v: string) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const difficulties: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepLabel}>{t('programs.step1')}</Text>

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

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('programs.difficulty')}</Text>
        <View style={styles.pillRow}>
          {difficulties.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.pill, difficulty === d && styles.pillActive]}
              onPress={() => setDifficulty(d)}
            >
              <Text style={[styles.pillText, difficulty === d && styles.pillTextActive]}>
                {t(`programs.${d}` as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('programs.durationDays')}</Text>
        <TextInput
          style={[styles.input, styles.inputSmall]}
          keyboardType="number-pad"
          placeholder="7"
          placeholderTextColor={colors.textMuted}
          value={durationDays}
          onChangeText={setDurationDays}
          maxLength={3}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !title.trim() && styles.btnDisabled]}
        onPress={onNext}
        disabled={!title.trim()}
      >
        <Text style={styles.primaryBtnText}>{t('common.next')}</Text>
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
}

function ExerciseRow({
  ex,
  onChange,
  onRemove,
}: {
  ex: ExerciseDraft;
  onChange: (field: keyof ExerciseDraft, value: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.exerciseRow}>
      <View style={styles.exerciseRowHeader}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder={t('programs.exerciseName')}
          placeholderTextColor={colors.textMuted}
          value={ex.exercise_name}
          onChangeText={(v) => onChange('exercise_name', v)}
        />
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
      <TextInput
        style={[styles.input, { marginTop: spacing.xs }]}
        placeholder={t('programs.notesPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={ex.notes}
        onChangeText={(v) => onChange('notes', v)}
      />
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
}: {
  durationDays: number;
  days: DayDraft[];
  setDays: (v: DayDraft[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [expandedDay, setExpandedDay] = useState<string | null>(days[0]?.key ?? null);

  const addExercise = (dayKey: string) => {
    const newEx: ExerciseDraft = {
      key: `${Date.now()}`,
      exercise_name: '',
      sets: '3',
      reps: '10',
      rest_time: '60s',
      notes: '',
      video_url: '',
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

  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepLabel}>{t('programs.step2')}</Text>

      {days.map((day) => (
        <View key={day.key} style={styles.dayCard}>
          <TouchableOpacity
            style={styles.dayHeader}
            onPress={() => setExpandedDay(expandedDay === day.key ? null : day.key)}
          >
            <Text style={styles.dayTitle}>{t('programs.day', { number: day.day_number })}</Text>
            <Text style={styles.dayMeta}>
              {day.exercises.length} {t('programs.exercises')}  {expandedDay === day.key ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {expandedDay === day.key && (
            <View style={styles.dayBody}>
              {day.exercises.length === 0 && (
                <Text style={styles.noExText}>{t('programs.noExercises')}</Text>
              )}
              {day.exercises.map((ex) => (
                <ExerciseRow
                  key={ex.key}
                  ex={ex}
                  onChange={(field, value) => updateExercise(day.key, ex.key, field, value)}
                  onRemove={() => removeExercise(day.key, ex.key)}
                />
              ))}
              <TouchableOpacity
                style={styles.addExBtn}
                onPress={() => addExercise(day.key)}
              >
                <Text style={styles.addExBtnText}>+ {t('programs.addExercise')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

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
  const { createProgram, addDay, addExercise } = useProgramStore();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [durationDays, setDurationDays] = useState('7');

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
      difficulty,
      duration_days: count,
      type: 'private',
    });

    if (progErr || !programId) {
      setSaving(false);
      return Alert.alert(t('common.error'), progErr ?? 'Failed to create program');
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
        });
      }
    }

    setSaving(false);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step === 1 ? router.back() : setStep(1))}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('programs.createProgram')}</Text>
        <View style={styles.stepIndicator}>
          <Text style={styles.stepText}>{step}/2</Text>
        </View>
      </View>

      {step === 1 ? (
        <Step1
          title={title} setTitle={setTitle}
          description={description} setDescription={setDescription}
          difficulty={difficulty} setDifficulty={setDifficulty}
          durationDays={durationDays} setDurationDays={setDurationDays}
          onNext={handleNext}
        />
      ) : (
        <Step2
          durationDays={parseInt(durationDays, 10) || 7}
          days={days}
          setDays={setDays}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </KeyboardAvoidingView>
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
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  stepIndicator: {
    backgroundColor: `${colors.primary}18`, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  stepText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

  stepContent: { padding: spacing['2xl'], paddingBottom: 100, gap: spacing.lg },
  stepLabel: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  fieldGroup: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  input: {
    backgroundColor: colors.card, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.md, color: colors.text,
  },
  inputSmall: { width: 100 },
  textarea: { minHeight: 72, textAlignVertical: 'top' },

  pillRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  pillTextActive: { color: colors.textInverse },

  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.lg, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textInverse },

  // Day cards
  dayCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  dayTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  dayMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  dayBody: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, gap: spacing.md },
  noExText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // Exercise rows
  exerciseRow: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    padding: spacing.sm, gap: spacing.xs, borderWidth: 1, borderColor: colors.borderLight,
  },
  exerciseRowHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  exerciseMiniRow: { flexDirection: 'row', gap: spacing.sm },
  miniLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  inputMini: {
    backgroundColor: colors.card, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    fontSize: fontSize.sm, color: colors.text,
  },
  removeExBtn: { padding: spacing.xs },
  removeExText: { fontSize: fontSize.md, color: colors.textMuted },
  addExBtn: {
    borderWidth: 1, borderColor: colors.primaryLight, borderStyle: 'dashed',
    borderRadius: borderRadius.sm, padding: spacing.sm, alignItems: 'center',
  },
  addExBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primaryLight },
});
