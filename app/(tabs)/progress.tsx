import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgressStore } from '../../src/stores/progressStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

type Section = 'measurements' | 'strength' | 'photos';

// ─── Simple bar sparkline ─────────────────────────────────────────────────────

function SparkChart({ data, color = colors.primary }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const HEIGHT = 52;
  const BAR_W = 7;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: HEIGHT, gap: 3 }}>
      {data.map((v, i) => {
        const h = Math.max(4, ((v - min) / range) * HEIGHT);
        const isLast = i === data.length - 1;
        return (
          <View
            key={i}
            style={{
              width: BAR_W,
              height: h,
              backgroundColor: isLast ? color : `${color}55`,
              borderRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}

// ─── Measurements section ─────────────────────────────────────────────────────

function MeasurementsSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { measurements, fetchMeasurements, deleteMeasurement, isLoading } = useProgressStore();

  useFocusEffect(useCallback(() => { fetchMeasurements(); }, [fetchMeasurements]));

  const latest = measurements[0] ?? null;
  const weights = measurements
    .slice()
    .reverse()
    .map((m) => m.weight_kg)
    .filter((v): v is number => v != null);

  const handleDelete = (id: string) => {
    Alert.alert(t('progress.deleteEntry'), t('progress.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteMeasurement(id);
          if (error) Alert.alert(t('common.error'), error);
        },
      },
    ]);
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/progress/log-measurement')}
      >
        <Text style={styles.addButtonText}>+ {t('progress.logMeasurement')}</Text>
      </TouchableOpacity>

      {latest && (
        <View style={styles.statsCard}>
          <Text style={styles.statsCardTitle}>{t('progress.latest')}</Text>
          <View style={styles.statRow}>
            {latest.weight_kg != null && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{latest.weight_kg}</Text>
                <Text style={styles.statLabel}>{t('progress.weightKg')} ({t('progress.weightUnit')})</Text>
              </View>
            )}
            {latest.body_fat_pct != null && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{latest.body_fat_pct}%</Text>
                <Text style={styles.statLabel}>{t('progress.bodyFat')}</Text>
              </View>
            )}
            {latest.muscle_mass_kg != null && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{latest.muscle_mass_kg}</Text>
                <Text style={styles.statLabel}>{t('progress.muscleMass')} ({t('progress.weightUnit')})</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {weights.length >= 2 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartLabel}>{t('progress.weightTrend')}</Text>
          <SparkChart data={weights} color={colors.primary} />
          <View style={styles.chartRange}>
            <Text style={styles.chartMin}>{Math.min(...weights)} kg</Text>
            <Text style={styles.chartMax}>{Math.max(...weights)} kg</Text>
          </View>
        </View>
      )}

      {isLoading && measurements.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : measurements.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⚖️</Text>
          <Text style={styles.emptyText}>{t('progress.noMeasurements')}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.hintText}>{t('progress.longPressDelete')}</Text>
          {measurements.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.logRow}
              onLongPress={() => handleDelete(m.id)}
              activeOpacity={0.7}
            >
              <View style={styles.logInfo}>
                <Text style={styles.logDate}>{m.date}</Text>
                <View style={styles.logStats}>
                  {m.weight_kg != null && (
                    <Text style={styles.logStat}>{m.weight_kg} kg</Text>
                  )}
                  {m.body_fat_pct != null && (
                    <Text style={styles.logStat}>{m.body_fat_pct}% fat</Text>
                  )}
                  {m.muscle_mass_kg != null && (
                    <Text style={styles.logStat}>{m.muscle_mass_kg} kg muscle</Text>
                  )}
                </View>
                {m.notes ? <Text style={styles.logNotes}>{m.notes}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

// ─── Strength section ─────────────────────────────────────────────────────────

function StrengthSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { strengthLogs, fetchStrengthLogs, deleteStrengthLog, isLoading } = useProgressStore();
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { fetchStrengthLogs(); }, [fetchStrengthLogs]));

  const exercises = Array.from(new Set(strengthLogs.map((l) => l.exercise_name)));
  const activeExercise = selectedExercise ?? exercises[0] ?? null;

  const filteredChronological = strengthLogs
    .filter((l) => l.exercise_name === activeExercise)
    .slice()
    .reverse();
  const chartWeights = filteredChronological.map((l) => l.weight_kg);

  const prs = exercises
    .map((ex) => strengthLogs.find((l) => l.exercise_name === ex && l.is_pr))
    .filter(Boolean);

  const handleDelete = (id: string) => {
    Alert.alert(t('progress.deleteEntry'), t('progress.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteStrengthLog(id);
          if (error) Alert.alert(t('common.error'), error);
        },
      },
    ]);
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/progress/log-strength')}
      >
        <Text style={styles.addButtonText}>+ {t('progress.logStrength')}</Text>
      </TouchableOpacity>

      {prs.length > 0 && (
        <View style={styles.prBanner}>
          <Text style={styles.prBannerTitle}>🏆 {t('progress.personalRecords')}</Text>
          {prs.map((pr) => pr && (
            <View key={pr.id} style={styles.prBannerRow}>
              <Text style={styles.prBannerExercise}>{pr.exercise_name}</Text>
              <Text style={styles.prBannerWeight}>{pr.weight_kg} kg</Text>
            </View>
          ))}
        </View>
      )}

      {exercises.length > 0 && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.exercisePicker}
            contentContainerStyle={{ gap: spacing.sm }}
          >
            {exercises.map((ex) => (
              <TouchableOpacity
                key={ex}
                style={[
                  styles.exerciseChip,
                  activeExercise === ex && styles.exerciseChipActive,
                ]}
                onPress={() => setSelectedExercise(ex)}
              >
                <Text
                  style={[
                    styles.exerciseChipText,
                    activeExercise === ex && styles.exerciseChipTextActive,
                  ]}
                >
                  {ex}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {chartWeights.length >= 2 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartLabel}>{t('progress.strengthTrend')}</Text>
              <SparkChart data={chartWeights} color={colors.success} />
              <View style={styles.chartRange}>
                <Text style={styles.chartMin}>{Math.min(...chartWeights)} kg</Text>
                <Text style={styles.chartMax}>{Math.max(...chartWeights)} kg</Text>
              </View>
            </View>
          )}

          <Text style={styles.hintText}>{t('progress.longPressDelete')}</Text>

          {strengthLogs
            .filter((l) => l.exercise_name === activeExercise)
            .map((log) => (
              <TouchableOpacity
                key={log.id}
                style={[styles.logRow, log.is_pr && styles.logRowPR]}
                onLongPress={() => handleDelete(log.id)}
                activeOpacity={0.7}
              >
                <View style={styles.logInfo}>
                  <View style={styles.logRowHeader}>
                    <Text style={styles.logDate}>{log.date}</Text>
                    {log.is_pr && (
                      <View style={styles.prBadgeContainer}>
                        <Text style={styles.prBadgeText}>{t('progress.prBadge')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.logStat}>
                    {log.weight_kg} kg · {log.sets} × {log.reps}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
        </>
      )}

      {isLoading && strengthLogs.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : strengthLogs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏋️</Text>
          <Text style={styles.emptyText}>{t('progress.noStrength')}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Photos section ───────────────────────────────────────────────────────────

function PhotosSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { photos, fetchPhotos, deletePhoto, isLoading } = useProgressStore();

  useFocusEffect(useCallback(() => { fetchPhotos(); }, [fetchPhotos]));

  const labelKey = (label: string) =>
    `progress.label${label.charAt(0).toUpperCase()}${label.slice(1)}` as any;

  const handleDelete = (id: string, url: string) => {
    Alert.alert(t('progress.deleteEntry'), t('progress.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await deletePhoto(id, url);
          if (error) Alert.alert(t('common.error'), error);
        },
      },
    ]);
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/progress/photos')}
      >
        <Text style={styles.addButtonText}>+ {t('progress.addPhoto')}</Text>
      </TouchableOpacity>

      {isLoading && photos.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : photos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📸</Text>
          <Text style={styles.emptyText}>{t('progress.noPhotos')}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.hintText}>{t('progress.longPressDelete')}</Text>
          <View style={styles.photoGrid}>
            {photos.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.photoCard}
                onLongPress={() => handleDelete(p.id, p.photo_url)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: p.photo_url }}
                  style={styles.photoImage}
                  resizeMode="cover"
                />
                <View style={styles.photoMeta}>
                  <Text style={styles.photoLabel}>{t(labelKey(p.label))}</Text>
                  <Text style={styles.photoDate}>{p.date}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('measurements');

  const sections: { key: Section; label: string }[] = [
    { key: 'measurements', label: t('progress.measurements') },
    { key: 'strength', label: t('progress.strength') },
    { key: 'photos', label: t('progress.photos') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('tabs.progress')}</Text>
      </View>

      <View style={styles.segmented}>
        {sections.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.segment, section === s.key && styles.segmentActive]}
            onPress={() => setSection(s.key)}
          >
            <Text style={[styles.segmentText, section === s.key && styles.segmentTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {section === 'measurements' && <MeasurementsSection />}
        {section === 'strength' && <StrengthSection />}
        {section === 'photos' && <PhotosSection />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.text },

  segmented: {
    flexDirection: 'row',
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.textMuted },
  segmentTextActive: { color: colors.textInverse, fontWeight: '600' },

  content: { paddingHorizontal: spacing['2xl'], paddingBottom: 80 },

  addButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addButtonText: { color: colors.textInverse, fontWeight: '600', fontSize: fontSize.md },

  statsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  statsCardTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  statRow: { flexDirection: 'row', gap: spacing['2xl'] },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },

  chartCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  chartLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  chartRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  chartMin: { fontSize: fontSize.xs, color: colors.textMuted },
  chartMax: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: spacing['4xl'] },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },

  hintText: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm },
  logRow: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  logRowPR: { borderColor: colors.warning, backgroundColor: `${colors.warning}0A` },
  logInfo: { gap: spacing.xs },
  logRowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logDate: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  logStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  logStat: { fontSize: fontSize.sm, color: colors.textSecondary },
  logNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },

  prBadgeContainer: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  prBadgeText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700' },

  prBanner: {
    backgroundColor: `${colors.warning}12`,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: `${colors.warning}35`,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  prBannerTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.warning },
  prBannerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prBannerExercise: { fontSize: fontSize.sm, color: colors.text },
  prBannerWeight: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },

  exercisePicker: { marginBottom: spacing.md },
  exerciseChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  exerciseChipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  exerciseChipTextActive: { color: colors.textInverse },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCard: {
    width: '31%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photoImage: { width: '100%', aspectRatio: 1 },
  photoMeta: { padding: spacing.sm },
  photoLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  photoDate: { fontSize: fontSize.xs, color: colors.textMuted },
});
