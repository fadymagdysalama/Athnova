import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useProgressStore } from '../../src/stores/progressStore';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

type Section = 'measurements' | 'strength' | 'photos';

const SECTION_META: Record<Section, { icon: string; color: string; faded: string }> = {
  measurements: { icon: '⚖', color: colors.primary,     faded: colors.accentFaded },
  strength:     { icon: '↑', color: colors.success,     faded: colors.successFaded },
  photos:       { icon: '⬡', color: colors.accent,      faded: colors.accentFaded },
};

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
              backgroundColor: isLast ? color : `${color}44`,
              borderRadius: 3,
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
  const { alertProps, showAlert } = useAppAlert();

  useFocusEffect(useCallback(() => { fetchMeasurements(); }, [fetchMeasurements]));

  const latest = measurements[0] ?? null;
  const weights = measurements
    .slice()
    .reverse()
    .map((m) => m.weight_kg)
    .filter((v): v is number => v != null);

  const handleDelete = (id: string) => {
    showAlert({
      title: t('progress.deleteEntry'),
      message: t('progress.deleteConfirm'),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteMeasurement(id);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
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
                <Text style={styles.statLabel}>{t('progress.weightUnit')}</Text>
              </View>
            )}
            {latest.weight_kg != null && latest.body_fat_pct != null && <View style={styles.statDivider} />}
            {latest.body_fat_pct != null && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{latest.body_fat_pct}%</Text>
                <Text style={styles.statLabel}>{t('progress.bodyFat')}</Text>
              </View>
            )}
            {latest.body_fat_pct != null && latest.muscle_mass_kg != null && <View style={styles.statDivider} />}
            {latest.muscle_mass_kg != null && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{latest.muscle_mass_kg}</Text>
                <Text style={styles.statLabel}>Muscle kg</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {weights.length >= 2 && (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartLabel}>{t('progress.weightTrend')}</Text>
            <Text style={styles.chartPeakLabel}>{Math.max(...weights)} kg</Text>
          </View>
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
          <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>⚖️</Text></View>
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
              <View style={styles.logAccentBar} />
              <View style={styles.logInfo}>
                <Text style={styles.logDate}>{m.date}</Text>
                <View style={styles.logStats}>
                  {m.weight_kg != null && (
                    <View style={styles.logStatChip}><Text style={styles.logStat}>{m.weight_kg} kg</Text></View>
                  )}
                  {m.body_fat_pct != null && (
                    <View style={styles.logStatChip}><Text style={styles.logStat}>{m.body_fat_pct}% fat</Text></View>
                  )}
                  {m.muscle_mass_kg != null && (
                    <View style={styles.logStatChip}><Text style={styles.logStat}>{m.muscle_mass_kg} kg muscle</Text></View>
                  )}
                </View>
                {m.notes ? <Text style={styles.logNotes}>{m.notes}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
      <AppAlert {...alertProps} />
    </View>
  );
}

// ─── Strength section ─────────────────────────────────────────────────────────

function StrengthSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { strengthLogs, fetchStrengthLogs, deleteStrengthLog, isLoading } = useProgressStore();
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const { alertProps, showAlert } = useAppAlert();

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
    showAlert({
      title: t('progress.deleteEntry'),
      message: t('progress.deleteConfirm'),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteStrengthLog(id);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
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
              <View style={styles.chartHeader}>
                <Text style={styles.chartLabel}>{t('progress.strengthTrend')}</Text>
                <Text style={styles.chartPeakLabel}>{Math.max(...chartWeights)} kg</Text>
              </View>
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
                <View style={[styles.logAccentBar, { backgroundColor: log.is_pr ? colors.warning : colors.success }]} />
                <View style={styles.logInfo}>
                  <View style={styles.logRowHeader}>
                    <Text style={styles.logDate}>{log.date}</Text>
                    {log.is_pr && (
                      <View style={styles.prBadgeContainer}>
                        <Text style={styles.prBadgeText}>{t('progress.prBadge')}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.logStatChip}>
                    <Text style={styles.logStat}>{log.weight_kg} kg · {log.sets} × {log.reps}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
        </>
      )}

      {isLoading && strengthLogs.length === 0 ? (
        <ActivityIndicator color={colors.success} style={{ marginTop: spacing.xl }} />
      ) : strengthLogs.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>🏋️</Text></View>
          <Text style={styles.emptyText}>{t('progress.noStrength')}</Text>
        </View>
      ) : null}
      <AppAlert {...alertProps} />
    </View>
  );
}

// ─── Photos section ───────────────────────────────────────────────────────────

function PhotosSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { photos, fetchPhotos, deletePhoto, isLoading } = useProgressStore();
  const { alertProps, showAlert } = useAppAlert();

  useFocusEffect(useCallback(() => { fetchPhotos(); }, [fetchPhotos]));

  const labelKey = (label: string) =>
    `progress.label${label.charAt(0).toUpperCase()}${label.slice(1)}` as any;

  const handleDelete = (id: string, url: string) => {
    showAlert({
      title: t('progress.deleteEntry'),
      message: t('progress.deleteConfirm'),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await deletePhoto(id, url);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
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
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : photos.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>📸</Text></View>
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
      <AppAlert {...alertProps} />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { myClientMode } = useConnectionStore();
  const [section, setSection] = useState<Section>('measurements');
  const isOnGroundClient = profile?.role !== 'coach' && myClientMode === 'offline';

  const sections: { key: Section; label: string }[] = [
    { key: 'measurements', label: t('progress.measurements') },
    { key: 'strength', label: t('progress.strength') },
    { key: 'photos', label: t('progress.photos') },
  ];

  const activeMeta = SECTION_META[section];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('tabs.progress')}</Text>
      </View>

      {/* Session History & Packages — only for On Ground clients */}
      {isOnGroundClient && (
        <TouchableOpacity
          style={styles.sessionsCard}
          onPress={() => router.push({ pathname: '/coach/offline-client-detail', params: { viewOnly: 'true' } })}
          activeOpacity={0.8}
        >
          <View>
            <Text style={styles.sessionsCardTitle}>Session History & Packages</Text>
            <Text style={styles.sessionsCardSub}>View past coach sessions and assigned packages</Text>
          </View>
          <Text style={styles.sessionsCardArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* Fixed 3-up segmented control */}
      <View style={styles.segmentedWrapper}>
        {sections.map((s) => {
          const active = section === s.key;
          const meta = SECTION_META[s.key];
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.segment, active && { backgroundColor: meta.color }]}
              onPress={() => setSection(s.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentIcon, active && styles.segmentIconActive]}>
                {meta.icon}
              </Text>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text, letterSpacing: -0.5 },

  // ── Fixed 3-tab segmented control ───────────────────────────────────────────
  segmentedWrapper: {
    flexDirection: 'row',
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
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
  segment: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 3,
  },
  segmentIcon: { fontSize: 15, color: colors.textMuted },
  segmentIconActive: { color: '#fff' },
  segmentText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  segmentTextActive: { color: '#fff' },

  content: { paddingHorizontal: spacing['2xl'], paddingBottom: 100, paddingTop: spacing.sm },

  // ── Add CTA button ───────────────────────────────────────────────────────────
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonText: { color: '#fff', fontWeight: '800', fontSize: fontSize.md, letterSpacing: 0.2 },

  // ── Latest stats card ────────────────────────────────────────────────────────
  statsCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  statsCardTitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '700',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  statValue: { fontSize: fontSize['2xl'], fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  statLabel: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontWeight: '600' },

  // ── Trend chart card ─────────────────────────────────────────────────────────
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  chartLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  chartPeakLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  chartRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  chartMin: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  chartMax: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },

  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingVertical: spacing['4xl'] },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', fontWeight: '500' },

  hintText: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm, fontStyle: 'italic' },

  // ── Log rows ─────────────────────────────────────────────────────────────────
  logRow: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  logRowPR: { borderColor: colors.warning },
  logAccentBar: { width: 4, backgroundColor: colors.primary },
  logInfo: { flex: 1, padding: spacing.md, gap: spacing.xs },
  logRowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logDate: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  logStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  logStatChip: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  logStat: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  logNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },

  // ── PR ───────────────────────────────────────────────────────────────────────
  prBadgeContainer: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  prBadgeText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '800' },

  prBanner: {
    backgroundColor: colors.warningFaded,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: `${colors.warning}55`,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  prBannerTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.warning },
  prBannerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prBannerExercise: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  prBannerWeight: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text },

  // ── Exercise picker ──────────────────────────────────────────────────────────
  exercisePicker: { marginBottom: spacing.md, flexGrow: 0 },
  exerciseChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  exerciseChipActive: { backgroundColor: colors.success, borderColor: colors.success },
  exerciseChipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  exerciseChipTextActive: { color: '#fff', fontWeight: '700' },

  // ── Photo grid ───────────────────────────────────────────────────────────────
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photoCard: {
    width: '47.5%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  photoImage: { width: '100%', aspectRatio: 0.85 },
  photoMeta: { padding: spacing.sm, gap: 2 },
  photoLabel: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  photoDate: { fontSize: fontSize.xs, color: colors.textMuted },

  // Session History card
  sessionsCard: {
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionsCardTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  sessionsCardSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  sessionsCardArrow: { fontSize: 22, color: colors.textMuted },
});
