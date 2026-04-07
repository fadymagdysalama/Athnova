import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TextInput } from '../../src/components/TextInput';
import { Button } from '../../src/components/Button';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { useProgressStore } from '../../src/stores/progressStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function LogStrengthScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { addStrengthLog } = useProgressStore();

  const [exercise, setExercise] = useState('');
  const [date, setDate] = useState(todayString());
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [loading, setLoading] = useState(false);
  const { alertProps, showAlert } = useAppAlert();

  const handleSave = async () => {
    if (!exercise.trim()) {
      showAlert({ title: t('common.error'), message: t('progress.exerciseRequired') });
      return;
    }
    const weightNum = parseFloat(weight);
    if (!weight || isNaN(weightNum) || weightNum <= 0) {
      showAlert({ title: t('common.error'), message: t('progress.weightRequired') });
      return;
    }

    setLoading(true);
    const { error, is_pr } = await addStrengthLog({
      exercise_name: exercise.trim(),
      date,
      weight_kg: weightNum,
      reps: parseInt(reps, 10) || 1,
      sets: parseInt(sets, 10) || 1,
    });
    setLoading(false);

    if (error) {
      showAlert({ title: t('common.error'), message: error });
    } else {
      if (is_pr) {
        showAlert({
          title: '🏆',
          message: t('progress.prDetected'),
          buttons: [{ text: t('common.done'), onPress: () => router.back() }],
        });
      } else {
        router.back();
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('progress.logStrength')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <TextInput
            label={t('progress.exerciseName')}
            value={exercise}
            onChangeText={setExercise}
            placeholder={t('progress.exerciseNamePlaceholder')}
            autoCapitalize="words"
          />

          <TextInput
            label={t('progress.date')}
            value={date}
            onChangeText={setDate}
            placeholder={t('progress.datePlaceholder')}
          />

          <TextInput
            label={t('progress.weight')}
            value={weight}
            onChangeText={setWeight}
            placeholder="0.0"
            keyboardType="decimal-pad"
          />

          <View style={styles.row}>
            <View style={styles.rowField}>
              <TextInput
                label={t('progress.sets')}
                value={sets}
                onChangeText={setSets}
                placeholder="3"
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.rowField}>
              <TextInput
                label={t('progress.reps')}
                value={reps}
                onChangeText={setReps}
                placeholder="10"
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>

        <Button
          title={t('progress.saveStrength')}
          onPress={handleSave}
          loading={loading}
          size="lg"
        />
      </ScrollView>
      <AppAlert {...alertProps} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 60,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { marginBottom: spacing.sm },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  content: {
    padding: spacing['2xl'],
    gap: spacing.lg,
    paddingBottom: 60,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  rowField: { flex: 1 },
});
