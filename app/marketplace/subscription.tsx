import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../src/stores/marketplaceStore';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { SubscriptionTier } from '../../src/types';

interface TierConfig {
  id: SubscriptionTier;
  nameKey: string;
  priceKey: string;
  features: string[];
  highlighted: boolean;
  color: string;
}

const TIER_RANK: Record<SubscriptionTier, number> = {
  starter: 0,
  pro: 1,
  business: 2,
};

const TIERS: TierConfig[] = [
  {
    id: 'starter',
    nameKey: 'subscription.starterName',
    priceKey: 'subscription.starterPrice',
    features: [
      'subscription.starterFeature1',
    ],
    highlighted: false,
    color: colors.textSecondary,
  },
  {
    id: 'pro',
    nameKey: 'subscription.proName',
    priceKey: 'subscription.proPrice',
    features: [
      'subscription.proFeature1',
    ],
    highlighted: true,
    color: colors.primary,
  },
  {
    id: 'business',
    nameKey: 'subscription.businessName',
    priceKey: 'subscription.businessPrice',
    features: [
      'subscription.businessFeature1',
    ],
    highlighted: false,
    color: colors.accent,
  },
];

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { coachSubscription, fetchCoachSubscription, upgradeSubscription, cancelSubscription } = useMarketplaceStore();
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<SubscriptionTier | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { alertProps, showAlert } = useAppAlert();
  const awaitingPayment = useRef(false);

  useEffect(() => {
    fetchCoachSubscription().then(() => setLoading(false));
  }, []);

  // Refresh subscription when user returns from the Paymob browser payment
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && awaitingPayment.current) {
        awaitingPayment.current = false;
        fetchCoachSubscription();
      }
    });
    return () => sub.remove();
  }, []);

  const currentTier: SubscriptionTier = coachSubscription?.tier ?? 'starter';

  const handleCancel = () => {
    showAlert({
      title: t('subscription.cancelTitle'),
      message: t('subscription.cancelDesc'),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('subscription.cancelConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              setCancelling(true);
              const result = await cancelSubscription();
              if (result.error) {
                showAlert({ title: t('common.error'), message: result.error });
              } else {
                showAlert({ title: t('subscription.cancelSuccess') });
              }
            } catch (error) {
              showAlert({ title: t('common.error'), message: error instanceof Error ? error.message : String(error) });
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    });
  };

  const handleSelect = (tier: SubscriptionTier) => {
    if (tier === currentTier) return;

    const isUpgrade = TIER_RANK[tier] > TIER_RANK[currentTier];

    showAlert({
      title: isUpgrade
        ? t('subscription.confirmUpgrade', { tier: t(`subscription.${tier}Name` as any) })
        : t('subscription.confirmDowngrade', { tier: t(`subscription.${tier}Name` as any) }),
      message: tier !== 'starter'
        ? t('subscription.confirmRecurringDesc', { tier: t(`subscription.${tier}Name` as any), price: t(`subscription.${tier}Price` as any) })
        : t('subscription.confirmDowngradeDesc'),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isUpgrade ? t('subscription.upgrade') : t('subscription.downgrade'),
          onPress: async () => {
            try {
              setUpgrading(tier);
              const result = await upgradeSubscription(tier);

              if (result.error) {
                showAlert({ title: t('common.error'), message: result.error });
              } else if (result.paymentUrl) {
                // Paid tier — open Paymob in Safari View Controller.
                // openAuthSessionAsync automatically closes and returns to the app
                // when Paymob redirects to the coachera:// scheme.
                awaitingPayment.current = true;
                await WebBrowser.openAuthSessionAsync(result.paymentUrl, 'coachera://');
                awaitingPayment.current = false;
                fetchCoachSubscription();
              } else {
                // Free tier (starter) — immediate
                showAlert({ title: t('subscription.upgradeSuccess') });
              }
            } catch (error) {
              showAlert({ title: t('common.error'), message: error instanceof Error ? error.message : String(error) });
            } finally {
              setUpgrading(null);
            }
          },
        },
      ],
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('subscription.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>{t('subscription.subtitle')}</Text>

        {/* Current plan banner */}
        <View style={styles.currentBanner}>
          <Text style={styles.currentBannerIcon}>✓</Text>
          <Text style={styles.currentBannerText}>
            {t('subscription.currentPlan')}:{' '}
            <Text style={styles.currentBannerTier}>{t(`subscription.${currentTier}Name` as any)}</Text>
          </Text>
        </View>

        {/* Tier cards */}
        {TIERS.map((tier) => {
          const isCurrent = tier.id === currentTier;
          const isUpgrading = upgrading === tier.id;
          const isUpgrade = TIER_RANK[tier.id] > TIER_RANK[currentTier];

          return (
            <View
              key={tier.id}
              style={[
                styles.tierCard,
                tier.highlighted && styles.tierCardHighlighted,
                isCurrent && styles.tierCardCurrent,
              ]}
            >
              {tier.highlighted && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>Most Popular</Text>
                </View>
              )}

              <View style={styles.tierHeader}>
                <View>
                  <Text style={[styles.tierName, { color: tier.color }]}>
                    {t(tier.nameKey as any)}
                  </Text>
                </View>
                <View style={styles.tierPriceBlock}>
                  <Text style={[styles.tierPrice, { color: tier.color }]}>
                    {t(tier.priceKey as any)}
                  </Text>
                  {tier.id !== 'starter' && (
                    <Text style={styles.tierPeriod}>{t('subscription.perMonth')}</Text>
                  )}
                </View>
              </View>

              <View style={styles.featureList}>
                {tier.features.map((fk) => (
                  <View key={fk} style={styles.featureRow}>
                    <Text style={[styles.featureCheck, { color: tier.color }]}>✓</Text>
                    <Text style={styles.featureText}>{t(fk as any)}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.selectBtn,
                  isCurrent && styles.selectBtnCurrent,
                  !isCurrent && { backgroundColor: tier.color },
                ]}
                onPress={() => handleSelect(tier.id)}
                disabled={isCurrent || isUpgrading}
                activeOpacity={0.85}
              >
                {isUpgrading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={[styles.selectBtnText, isCurrent && styles.selectBtnTextCurrent]}>
                    {isCurrent
                      ? t('subscription.currentPlan')
                      : isUpgrade
                        ? t('subscription.upgrade')
                        : t('subscription.downgrade')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.recurringBanner}>
          <Text style={styles.recurringText}>{t('subscription.recurringNotice')}</Text>
        </View>

        {/* Cancel subscription — only shown for active paid plans */}
        {currentTier !== 'starter' && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={cancelling}
            activeOpacity={0.7}
          >
            {cancelling ? (
              <ActivityIndicator color={colors.error} size="small" />
            ) : (
              <Text style={styles.cancelBtnText}>{t('subscription.cancelPlan')}</Text>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.footnote}>
          {t('subscription.footnote')}
        </Text>
      </ScrollView>
      <AppAlert {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  content: { padding: spacing.lg, paddingBottom: 60 },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },

  currentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.success}12`,
    borderWidth: 1,
    borderColor: `${colors.success}30`,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  currentBannerIcon: { fontSize: fontSize.lg, color: colors.success },
  currentBannerText: { fontSize: fontSize.sm, color: colors.success },
  currentBannerTier: { fontWeight: '700' },

  tierCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  tierCardHighlighted: {
    borderColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  tierCardCurrent: {
    borderColor: colors.success,
  },

  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomLeftRadius: borderRadius.md,
  },
  popularBadgeText: { fontSize: fontSize.xs, color: colors.textInverse, fontWeight: '700' },

  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  tierName: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: 2 },
  tierDesc: { fontSize: fontSize.sm, color: colors.textMuted },
  tierPriceBlock: { alignItems: 'flex-end' },
  tierPrice: { fontSize: fontSize['2xl'], fontWeight: '800' },
  tierPeriod: { fontSize: fontSize.xs, color: colors.textMuted },

  featureList: { marginBottom: spacing.lg, gap: spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureCheck: { fontSize: fontSize.sm, fontWeight: '700', width: 18 },
  featureText: { fontSize: fontSize.sm, color: colors.textSecondary, flex: 1 },

  selectBtn: {
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  selectBtnCurrent: {
    backgroundColor: `${colors.success}15`,
    borderWidth: 1,
    borderColor: `${colors.success}40`,
  },
  selectBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textInverse },
  selectBtnTextCurrent: { color: colors.success },

  recurringBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: `${colors.primary}10`,
    borderWidth: 1,
    borderColor: `${colors.primary}25`,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  recurringIcon: { fontSize: fontSize.md },
  recurringText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  cancelBtnText: {
    fontSize: fontSize.sm,
    color: colors.error,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  footnote: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing['2xl'],
    lineHeight: 18,
  },
});
