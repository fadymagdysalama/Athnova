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
import { colors, fontSize, spacing } from '../../src/constants/theme';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { signUp } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError('');

    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedUsername) {
      setError(t('auth.usernameRequired'));
      return;
    }

    // Basic username validation
    if (!/^[a-z0-9_]{3,20}$/.test(trimmedUsername)) {
      setError('Username must be 3-20 characters (letters, numbers, underscores only)');
      return;
    }

    if (password.length < 6) {
      setError(t('auth.passwordMin'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);
    const { error: signUpError } = await signUp(trimmedUsername, password);
    setLoading(false);

    if (signUpError) {
      setError(signUpError);
    } else {
      // After signup, redirect to profile setup
      router.replace('/auth/setup-profile');
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>COACHERA</Text>
            <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.title}>{t('auth.signUp')}</Text>

            <TextInput
              label={t('auth.username')}
              placeholder={t('auth.usernamePlaceholder')}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              rightIcon={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Text style={styles.showPassword}>
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </Text>
                </TouchableOpacity>
              }
            />

            <TextInput
              label={t('auth.confirmPassword')}
              placeholder={t('auth.passwordPlaceholder')}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              title={t('auth.signUp')}
              onPress={handleRegister}
              loading={loading}
              size="lg"
              style={styles.button}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('auth.hasAccount')} </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.footerLink}>{t('auth.signIn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['5xl'],
  },
  logo: {
    fontSize: fontSize['4xl'],
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 4,
  },
  tagline: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  form: {
    width: '100%',
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing['3xl'],
    letterSpacing: -0.5,
  },
  showPassword: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '600',
    paddingHorizontal: 4,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing['3xl'],
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  footerLink: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
});
