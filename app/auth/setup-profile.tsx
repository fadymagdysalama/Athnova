import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/stores/authStore';
import { Button, TextInput } from '../../src/components';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';
import type { UserRole } from '../../src/types';

export default function SetupProfileScreen() {
  const { t } = useTranslation();
  const { session, pendingUsername, createProfile } = useAuthStore();

  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Use pendingUsername from store (set during signup), derived from session email as fallback
  const derivedUsername =
    pendingUsername ||
    session?.user?.email?.replace('@coachera.app', '') ||
    '';

  const [username, setUsername] = useState(derivedUsername);

  const handleCreateProfile = async () => {
    setError('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    if (!role) {
      setError('Please select your role');
      return;
    }

    setLoading(true);
    const { error: profileError } = await createProfile(
      username,
      displayName.trim(),
      role
    );
    setLoading(false);

    if (profileError) {
      setError(profileError);
    } else {
      router.replace('/');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('profile.setupTitle')}</Text>
            <Text style={styles.subtitle}>{t('profile.setupSubtitle')}</Text>
          </View>

          {/* Username display — editable only if store lost the value */}
          {derivedUsername ? (
            <View style={styles.usernameBox}>
              <Text style={styles.usernameLabel}>@{username}</Text>
            </View>
          ) : (
            <TextInput
              label="Username"
              placeholder="Enter your username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          <TextInput
            label={t('profile.displayName')}
            placeholder={t('profile.displayNamePlaceholder')}
            value={displayName}
            onChangeText={setDisplayName}
          />

          {/* Role Selection */}
          <Text style={styles.roleLabel}>{t('profile.selectRole')}</Text>
          <View style={styles.roleContainer}>
            <TouchableOpacity
              style={[
                styles.roleCard,
                role === 'coach' && styles.roleCardActive,
              ]}
              onPress={() => setRole('coach')}
              activeOpacity={0.8}
            >
              <Text style={styles.roleIcon}>🏋️</Text>
              <Text style={[styles.roleTitle, role === 'coach' && styles.roleTitleActive]}>
                {t('profile.coach')}
              </Text>
              <Text style={styles.roleDesc}>{t('profile.coachDesc')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleCard,
                role === 'client' && styles.roleCardActive,
              ]}
              onPress={() => setRole('client')}
              activeOpacity={0.8}
            >
              <Text style={styles.roleIcon}>💪</Text>
              <Text style={[styles.roleTitle, role === 'client' && styles.roleTitleActive]}>
                {t('profile.client')}
              </Text>
              <Text style={styles.roleDesc}>{t('profile.clientDesc')}</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={t('profile.createProfile')}
            onPress={handleCreateProfile}
            loading={loading}
            disabled={!role || !displayName.trim()}
            size="lg"
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['4xl'],
  },
  header: {
    marginBottom: spacing['3xl'],
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  usernameBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
  },
  usernameLabel: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  roleLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  roleCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  roleCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentFaded,
  },
  roleIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  roleTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  roleTitleActive: {
    color: colors.accent,
  },
  roleDesc: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
    backgroundColor: colors.errorFaded,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  button: {
    marginTop: spacing.sm,
  },
});
