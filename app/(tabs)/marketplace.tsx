import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../src/stores/marketplaceStore';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { PublicProgram } from '../../src/types';


// ─── Public program card for CLIENT browse ────────────────────────────────────
function ProgramCard({
  program,
  purchased,
  onPress,
}: {
  program: PublicProgram;
  purchased: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{program.title}</Text>
          {purchased && (
            <View style={styles.purchasedBadge}>
              <Text style={styles.purchasedBadgeText}>{t('marketplace.purchased')}</Text>
            </View>
          )}
        </View>
      </View>

      {!!program.description && (
        <Text style={styles.cardDesc} numberOfLines={2}>{program.description}</Text>
      )}

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{t('programs.days', { count: program.duration_days })}</Text>
        {program.creator && (
          <Text style={styles.creatorText}>{t('marketplace.by', { name: program.creator.display_name })}</Text>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.priceText}>
          {program.price && program.price > 0
            ? `EGP ${program.price.toFixed(2)}`
            : t('marketplace.getFree')}
        </Text>
        <View style={[styles.actionBtn, purchased && styles.actionBtnOwned]}>
          <Text style={[styles.actionBtnText, purchased && styles.actionBtnTextOwned]}>
            {purchased ? t('marketplace.viewProgram') : (
              program.price && program.price > 0
                ? t('marketplace.buy', { price: program.price.toFixed(2) })
                : t('marketplace.getFree')
            )}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Browse view (all users) ─────────────────────────────────────────────────
function ClientMarketplaceView() {
  const { t } = useTranslation();
  const router = useRouter();
  const { publicPrograms, purchases, isLoading, fetchPublicPrograms, fetchMyPurchases, isPurchased, purchaseProgram } =
    useMarketplaceStore();
  const [refreshing, setRefreshing] = useState(false);

  const [purchasing, setPurchasing] = useState<string | null>(null);
  const { alertProps, showAlert } = useAppAlert();

  // Tab-focus refresh
  useFocusEffect(
    useCallback(() => {
      fetchPublicPrograms();
      fetchMyPurchases();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPublicPrograms();
    await fetchMyPurchases();
    setRefreshing(false);
  };

  const handleCardPress = (program: PublicProgram) => {
    if (isPurchased(program.id)) {
      // Go directly to program detail viewer (reuse existing detail screen)
      router.push({ pathname: '/programs/detail', params: { id: program.id, marketplace: '1' } });
    } else {
      router.push({ pathname: '/marketplace/detail', params: { id: program.id } });
    }
  };

  const handleQuickBuy = async (program: PublicProgram) => {
    if (isPurchased(program.id)) return;

    const isFree = !program.price || program.price === 0;
    const message = isFree
      ? t('marketplace.purchaseFree', { title: program.title })
      : t('marketplace.purchaseConfirm', { title: program.title, price: program.price!.toFixed(2) });

    showAlert({
      title: t('marketplace.purchaseTitle'),
      message,
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isFree ? t('marketplace.getFree') : t('marketplace.buy', { price: program.price!.toFixed(2) }),
          onPress: async () => {
            try {
              setPurchasing(program.id);
              const { error } = await purchaseProgram(program.id);
              if (error) {
                showAlert({ title: t('common.error'), message: error });
              } else {
                showAlert({ title: t('marketplace.purchaseSuccess'), message: t('marketplace.purchaseSuccessHint') });
              }
            } catch (error) {
              showAlert({ title: t('common.error'), message: error instanceof Error ? error.message : String(error) });
            } finally {
              setPurchasing(null);
            }
          },
        },
      ],
    });
  };

  if (isLoading && publicPrograms.length === 0 && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >

        {publicPrograms.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🏪</Text>
            <Text style={styles.emptyTitle}>{t('marketplace.noPrograms')}</Text>
            <Text style={styles.emptyHint}>{t('marketplace.noProgramsHint')}</Text>
          </View>
        ) : (
          publicPrograms.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              purchased={isPurchased(p.id)}
              onPress={() => handleCardPress(p)}
            />
          ))
        )}
      </ScrollView>
      <AppAlert {...alertProps} />
    </>
  );
}

// ─── Root screen ──────────────────────────────────────────────────────────────
export default function MarketplaceScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.comingSoonContainer}>
        <View style={styles.comingSoonIconWrap}>
          <Text style={styles.comingSoonIcon}>🏪</Text>
        </View>
        <Text style={styles.comingSoonLabel}>{t('common.comingSoon', 'Coming Soon')}</Text>
        <Text style={styles.comingSoonTitle}>{t('marketplace.title', 'Marketplace')}</Text>
        <Text style={styles.comingSoonDesc}>
          {t(
            'marketplace.comingSoonDesc',
            'Browse and purchase programs from top coaches. We\'re putting the finishing touches on this feature — stay tuned!'
          )}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },

  // Coming Soon
  comingSoonContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingBottom: 60,
  },
  comingSoonIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  comingSoonIcon: { fontSize: 44 },
  comingSoonLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  comingSoonTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  comingSoonDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  content: { padding: spacing.lg, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },

  // Filter chips
  filterRow: { marginBottom: spacing.lg, flexGrow: 0 },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: colors.textInverse, fontWeight: '700' },

  // Client program card
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginRight: spacing.sm },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, flex: 1, letterSpacing: -0.2 },
  purchasedBadge: {
    backgroundColor: colors.successFaded,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  purchasedBadgeText: { fontSize: fontSize.xs, color: colors.success, fontWeight: '700' },
  diffBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  diffText: { fontSize: fontSize.xs, fontWeight: '700' },
  cardDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  metaText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  creatorText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '400' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  actionBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 1,
    borderRadius: borderRadius.full,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  actionBtnOwned: {
    backgroundColor: colors.successFaded,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textInverse },
  actionBtnTextOwned: { color: colors.success },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.lg },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  emptyHint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', maxWidth: 260 },
});
