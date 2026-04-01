import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../src/stores/marketplaceStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { PublicProgram } from '../../src/types';

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: colors.success,
  intermediate: colors.warning,
  advanced: colors.error,
};

const FILTERS = ['all', 'beginner', 'intermediate', 'advanced'] as const;
type Filter = typeof FILTERS[number];

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
  const diffColor = DIFFICULTY_COLOR[program.difficulty] ?? colors.accent;

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
        <View style={[styles.diffBadge, { backgroundColor: `${diffColor}18` }]}>
          <Text style={[styles.diffText, { color: diffColor }]}>
            {t(`programs.${program.difficulty}` as any)}
          </Text>
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
            ? `$${program.price.toFixed(2)}`
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
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // Keep a ref so the stable useFocusEffect callback always sees the current filter
  const filterRef = useRef<Filter>('all');
  filterRef.current = filter;

  // Tab-focus refresh (stable callback, reads filter from ref)
  useFocusEffect(
    useCallback(() => {
      fetchPublicPrograms(filterRef.current);
      fetchMyPurchases();
    }, [])
  );

  // Filter-change fetch — skip the very first render (handled by useFocusEffect above)
  const isFirstFocus = useRef(true);
  useEffect(() => {
    if (isFirstFocus.current) { isFirstFocus.current = false; return; }
    fetchPublicPrograms(filter);
    fetchMyPurchases();
  }, [filter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPublicPrograms(filter);
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

    Alert.alert(t('marketplace.purchaseTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: isFree ? t('marketplace.getFree') : t('marketplace.buy', { price: program.price!.toFixed(2) }),
        onPress: async () => {
          try {
            setPurchasing(program.id);
            const { error } = await purchaseProgram(program.id);
            if (error) {
              Alert.alert(t('common.error'), error);
            } else {
              Alert.alert(t('marketplace.purchaseSuccess'), t('marketplace.purchaseSuccessHint'));
            }
          } catch (error) {
            Alert.alert(t('common.error'), error instanceof Error ? error.message : String(error));
          } finally {
            setPurchasing(null);
          }
        },
      },
    ]);
  };

  if (isLoading && publicPrograms.length === 0 && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {t(`marketplace.filter${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
  );
}

// ─── Root screen ──────────────────────────────────────────────────────────────
export default function MarketplaceScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('marketplace.title')}</Text>
        <Text style={styles.headerSub}>{t('marketplace.browse')}</Text>
      </View>
      <ClientMarketplaceView />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
  },
  headerSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  filterChipTextActive: { color: colors.textInverse },

  // Client program card
  card: {
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginRight: spacing.sm },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, flex: 1 },
  purchasedBadge: {
    backgroundColor: `${colors.success}18`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  purchasedBadgeText: { fontSize: fontSize.xs, color: colors.success, fontWeight: '600' },
  diffBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  diffText: { fontSize: fontSize.xs, fontWeight: '700' },
  cardDesc: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  metaText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  creatorText: { fontSize: fontSize.sm, color: colors.textMuted },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.primary },
  actionBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  actionBtnOwned: { backgroundColor: `${colors.success}20` },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textInverse },
  actionBtnTextOwned: { color: colors.success },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.lg },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  emptyHint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', maxWidth: 260 },
});
