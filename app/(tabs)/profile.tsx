import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { Button } from '../../src/components';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';
import i18n from '../../src/i18n';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuthStore();

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
        </View>

        {/* Settings */}
        <View style={styles.section}>
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

        <Text style={styles.version}>Athnova v1.0.0</Text>
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
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing['2xl'],
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing['3xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing['2xl'],
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: {
    fontSize: fontSize['4xl'],
    fontWeight: '700',
    color: colors.text,
  },
  displayName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  username: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  roleBadge: {
    backgroundColor: colors.primary + '20',
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  roleText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
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
