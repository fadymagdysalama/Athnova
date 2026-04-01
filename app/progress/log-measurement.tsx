import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TextInput } from '../../src/components/TextInput';
import { Button } from '../../src/components/Button';
import { useProgressStore } from '../../src/stores/progressStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function LogMeasurementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { addMeasurement } = useProgressStore();

  const [date, setDate] = useState(todayString());
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [muscleMass, setMuscleMass] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const weightNum = weight ? parseFloat(weight) : null;
    const bodyFatNum = bodyFat ? parseFloat(bodyFat) : null;
    const muscleMassNum = muscleMass ? parseFloat(muscleMass) : null;

    if (!weightNum && !bodyFatNum && !muscleMassNum) {
      Alert.alert(t('common.error'), t('progress.atLeastOne'));
      return;
    }

    setLoading(true);
    const { error } = await addMeasurement({
      date,
      weight_kg: weightNum,
      body_fat_pct: bodyFatNum,
      muscle_mass_kg: muscleMassNum,
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (error) {
      Alert.alert(t('common.error'), error);
    } else {
      router.back();
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
        <Text style={styles.headerTitle}>{t('progress.logMeasurement')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <TextInput
            label={t('progress.date')}
            value={date}
            onChangeText={setDate}
            placeholder={t('progress.datePlaceholder')}
            keyboardType="default"
          />

          <TextInput
            label={`${t('progress.weightKg')} (${t('progress.weightUnit')})`}
            value={weight}
            onChangeText={setWeight}
            placeholder="0.0"
            keyboardType="decimal-pad"
          />

          <TextInput
            label={`${t('progress.bodyFat')} (%)`}
            value={bodyFat}
            onChangeText={setBodyFat}
            placeholder="0.0"
            keyboardType="decimal-pad"
          />

          <TextInput
            label={`${t('progress.muscleMass')} (${t('progress.weightUnit')})`}
            value={muscleMass}
            onChangeText={setMuscleMass}
            placeholder="0.0"
            keyboardType="decimal-pad"
          />

          <TextInput
            label={t('progress.notes')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('progress.notesPlaceholder')}
            multiline
            numberOfLines={3}
            style={styles.notesInput}
          />
        </View>

        <Button
          title={t('progress.saveMeasurement')}
          onPress={handleSave}
          loading={loading}
          size="lg"
        />
      </ScrollView>
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
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
});
