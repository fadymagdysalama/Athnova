import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TextInput } from '../../src/components';
import { Button } from '../../src/components';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';
import { useFeedbackStore, type FeedbackCategory } from '../../src/stores/feedbackStore';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: { id: FeedbackCategory; emoji: string; labelKey: string }[] = [
  { id: 'bug',     emoji: '🐛', labelKey: 'feedback.catBug' },
  { id: 'feature', emoji: '✨', labelKey: 'feedback.catFeature' },
  { id: 'general', emoji: '💬', labelKey: 'feedback.catGeneral' },
  { id: 'help',    emoji: '❓', labelKey: 'feedback.catHelp' },
];

// ─── Success state ────────────────────────────────────────────────────────────

function SuccessView() {
  const { t } = useTranslation();
  return (
    <View style={styles.successContainer}>
      <Text style={styles.successEmoji}>🎉</Text>
      <Text style={styles.successTitle}>{t('feedback.successTitle')}</Text>
      <Text style={styles.successBody}>{t('feedback.successBody')}</Text>
      <Button
        title={t('common.done')}
        onPress={() => router.back()}
        style={styles.successBtn}
      />
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function FeedbackScreen() {
  const { t } = useTranslation();
  const { submitFeedback, isSubmitting } = useFeedbackStore();

  const [category, setCategory]   = useState<FeedbackCategory>('general');
  const [subject, setSubject]     = useState('');
  const [message, setMessage]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    if (!subject.trim()) {
      setError(t('feedback.errorSubject'));
      return;
    }
    if (!message.trim()) {
      setError(t('feedback.errorMessage'));
      return;
    }

    const { error: submitError } = await submitFeedback({ category, subject, message });
    if (submitError) {
      setError(submitError);
      return;
    }
    setSubmitted(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('feedback.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      {submitted ? (
        <SuccessView />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Category chips */}
            <Text style={styles.sectionLabel}>{t('feedback.category')}</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => {
                const active = category === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCategory(cat.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {t(cat.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Subject */}
            <TextInput
              label={t('feedback.subject')}
              placeholder={t('feedback.subjectPlaceholder')}
              value={subject}
              onChangeText={setSubject}
              maxLength={120}
              returnKeyType="next"
            />

            {/* Message */}
            <TextInput
              label={t('feedback.message')}
              placeholder={t('feedback.messagePlaceholder')}
              value={message}
              onChangeText={setMessage}
              maxLength={2000}
              multiline
              numberOfLines={6}
              style={styles.messageInput}
              textAlignVertical="top"
            />

            {/* Character counter */}
            <Text style={styles.charCount}>{message.length} / 2000</Text>

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <Button
              title={isSubmitting ? t('common.loading') : t('feedback.submit')}
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={styles.submitBtn}
            />

            <Text style={styles.note}>{t('feedback.note')}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 30,
    color: colors.primary,
    lineHeight: 34,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  content: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: -spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(30, 58, 138, 0.07)',
  },
  chipEmoji: {
    fontSize: 15,
  },
  chipLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipLabelActive: {
    color: colors.primary,
  },
  messageInput: {
    minHeight: 140,
    paddingTop: spacing.md,
  },
  charCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: -spacing.md,
  },
  errorBox: {
    backgroundColor: colors.errorFaded,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
  note: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  // ─── Success ──────────────────────────────────────────────────────────────
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
    gap: spacing.lg,
  },
  successEmoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  successBody: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  successBtn: {
    marginTop: spacing.xl,
    width: '100%',
  },
});
