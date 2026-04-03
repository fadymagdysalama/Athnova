import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../src/stores/marketplaceStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { PublicProgram, ProgramDayWithExercises } from '../../src/types';

function ExerciseRow({ name, sets, reps, rest }: { name: string; sets: number; reps: string; rest: string | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.exerciseRow}>
      <Text style={styles.exerciseName}>{name}</Text>
      <Text style={styles.exerciseMeta}>
        {t('programs.sets_reps', { sets, reps })}
        {rest ? `  ·  ${t('programs.rest', { time: rest })}` : ''}
      </Text>
    </View>
  );
}

export default function MarketplaceDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fetchProgramPreview, isPurchased, fetchMyPurchases, purchaseProgram } = useMarketplaceStore();

  const [program, setProgram] = useState<PublicProgram | null>(null);
  const [previewDay, setPreviewDay] = useState<ProgramDayWithExercises | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      await fetchMyPurchases();
      const { program: p, previewDay: d } = await fetchProgramPreview(id);
      setProgram(p);
      setPreviewDay(d);
      setLoading(false);
    })();
  }, [id]);

  // Re-check purchases when user returns from Paymob browser
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        fetchMyPurchases();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const owned = program ? isPurchased(program.id) : false;

  const handlePurchase = () => {
    if (!program) return;
    if (owned) {
      router.replace({ pathname: '/programs/detail', params: { id: program.id, marketplace: '1' } });
      return;
    }

    const isFree = !program.price || program.price === 0;
    const message = isFree
      ? t('marketplace.purchaseFree', { title: program.title })
      : t('marketplace.purchaseConfirm', { title: program.title, price: program.price!.toFixed(2) });

    Alert.alert(t('marketplace.purchaseTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: isFree ? t('marketplace.getFree') : t('marketplace.buy', { price: program.price!.toFixed(2) }),
        onPress: async () => {
          try {
            setPurchasing(true);
            const { error, paymentUrl } = await purchaseProgram(program.id);

            if (error) {
              Alert.alert(t('common.error'), error);
            } else if (paymentUrl) {
              // Open Paymob in Safari View Controller; auto-closes when Paymob redirects to coachera://
              await WebBrowser.openAuthSessionAsync(paymentUrl, 'coachera://');
              fetchMyPurchases();
            } else {
              // Free program acquired
              Alert.alert(
                t('marketplace.purchaseSuccess'),
                t('marketplace.purchaseSuccessHint'),
                [
                  {
                    text: t('marketplace.viewProgram'),
                    onPress: () =>
                      router.replace({ pathname: '/programs/detail', params: { id: program.id, marketplace: '1' } }),
                  },
                ],
              );
            }
          } catch (error) {
            Alert.alert(t('common.error'), error instanceof Error ? error.message : String(error));
          } finally {
            setPurchasing(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!program) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}><Text style={styles.errorText}>{t('common.error')}</Text></View>
      </SafeAreaView>
    );
  }

  const isFree = !program.price || program.price === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{program.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Program summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTitleRow}>
            <Text style={styles.summaryTitle}>{program.title}</Text>
          </View>

          {program.creator && (
            <Text style={styles.creatorText}>{t('marketplace.by', { name: program.creator.display_name })}</Text>
          )}

          {!!program.description && (
            <Text style={styles.description}>{program.description}</Text>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{program.duration_days}</Text>
              <Text style={styles.statLabel}>Days</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {isFree ? 'Free' : `EGP ${program.price!.toFixed(2)}`}
              </Text>
              <Text style={styles.statLabel}>Price</Text>
            </View>
          </View>
        </View>

        {/* Preview day */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('marketplace.previewDay')}</Text>
        </View>

        {previewDay && previewDay.exercises.length > 0 ? (
          <View style={styles.previewCard}>
            {previewDay.exercises.map((ex) => (
              <ExerciseRow
                key={ex.id}
                name={ex.exercise_name}
                sets={ex.sets}
                reps={ex.reps}
                rest={ex.rest_time}
              />
            ))}
          </View>
        ) : (
          <View style={styles.previewCard}>
            <Text style={styles.emptyPreview}>{t('programs.noExercises')}</Text>
          </View>
        )}

        {/* Locked days notice */}
        {!owned && program.duration_days > 1 && (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <Text style={styles.lockedText}>
              {t('marketplace.lockedContent', { count: program.duration_days - 1 })}
            </Text>
          </View>
        )}

        {/* Spacer for buy button */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Purchase / View CTA */}
      <View style={styles.ctaContainer}>
        {owned ? (
          <TouchableOpacity style={styles.ctaBtn} onPress={handlePurchase} activeOpacity={0.85}>
            <Text style={styles.ctaBtnText}>{t('marketplace.viewProgram')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.ctaBtn, purchasing && styles.ctaBtnDisabled]}
            onPress={handlePurchase}
            activeOpacity={0.85}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.ctaBtnText}>
                {isFree
                  ? t('marketplace.getFree')
                  : t('marketplace.buy', { price: program.price!.toFixed(2) })}
              </Text>
            )}
          </TouchableOpacity>
        )}
        {owned && (
          <Text style={styles.ownedNote}>{t('marketplace.alreadyPurchased')}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: fontSize.md, color: colors.error },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, color: colors.primary, fontWeight: '300' },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },

  content: { padding: spacing.lg, paddingBottom: 40 },

  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing['2xl'],
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  summaryTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, flex: 1, marginRight: spacing.sm },
  diffBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  diffText: { fontSize: fontSize.xs, fontWeight: '700' },
  creatorText: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },

  statsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  statDivider: { width: 1, height: 36, backgroundColor: colors.borderLight },

  sectionHeader: { marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },

  previewCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  exerciseRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  exerciseName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: 2 },
  exerciseMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  emptyPreview: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', padding: spacing.lg },

  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: `${colors.warning}10`,
    borderWidth: 1,
    borderColor: `${colors.warning}30`,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  lockedIcon: { fontSize: 20 },
  lockedText: { fontSize: fontSize.sm, color: colors.warning, fontWeight: '500', flex: 1 },

  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  ctaBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { fontSize: fontSize.md, fontWeight: '800', color: colors.textInverse },
  ownedNote: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
