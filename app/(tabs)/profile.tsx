import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { useMarketplaceStore } from '../../src/stores/marketplaceStore';
import { Button } from '../../src/components';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';
import i18n from '../../src/i18n';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuthStore();
  const { coachSubscription, fetchCoachSubscription } = useMarketplaceStore();

  useEffect(() => {
    if (profile?.role === 'coach') {
      fetchCoachSubscription();
    }
  }, [fetchCoachSubscription, profile?.role]);

  if (!profile) return null;

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(), // let onAuthStateChange + index.tsx handle navigation
      },
    ]);
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('tabs.profile')}</Text>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile.display_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.displayName}>{profile.display_name}</Text>
          <Text style={styles.username}>@{profile.username}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {profile.role === 'coach' ? '🏋️ Coach' : '💪 Client'}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaLabel}>Language</Text>
              <Text style={styles.metaValue}>{profile.language.toUpperCase()}</Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaLabel}>Joined</Text>
              <Text style={styles.metaValue}>{new Date(profile.created_at).toLocaleDateString()}</Text>
            </View>
          </View>
        </View>

        {profile.role === 'coach' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Coach Subscription</Text>
            <Text style={styles.sectionSubtitle}>
              Current plan: {(coachSubscription?.tier ?? 'starter').toUpperCase()}
            </Text>
            <Button
              title="Manage Subscription"
              onPress={() => router.push('/marketplace/subscription')}
              style={styles.settingButton}
              textStyle={{ color: '#FFFFFF' }}
            />
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <Button
            title={`Language: ${i18n.language === 'en' ? 'English 🇺🇸' : 'العربية 🇸🇦'}`}
            onPress={toggleLanguage}
            variant="secondary"
            style={styles.settingButton}
          />

          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="outline"
            style={styles.signOutButton}
            textStyle={{ color: colors.error }}
          />
        </View>

        <Text style={styles.version}>Coachera v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing['2xl'],
    letterSpacing: -0.5,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing['3xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing['2xl'],
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarText: {
    fontSize: fontSize['4xl'],
    fontWeight: '700',
    color: colors.textInverse,
  },
  displayName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  username: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  roleBadge: {
    backgroundColor: colors.accentFaded,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  roleText: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  metaPill: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  metaValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  section: {
    gap: spacing.md,
  },
  settingButton: {
    justifyContent: 'flex-start',
  },
  signOutButton: {
    borderColor: colors.error,
  },
  version: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing['3xl'],
  },
});
