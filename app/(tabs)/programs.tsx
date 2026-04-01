import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useProgramStore } from '../../src/stores/programStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { Program } from '../../src/types';
const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: colors.success,
  intermediate: colors.warning,
  advanced: colors.error,
};

function DifficultyBadge({ level }: { level: string }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.badge, { backgroundColor: `${DIFFICULTY_COLOR[level] ?? colors.accent}18` }]}>
      <Text style={[styles.badgeText, { color: DIFFICULTY_COLOR[level] ?? colors.accent }]}>
        {t(`programs.${level}` as any)}
      </Text>
    </View>
  );
}

function CoachView() {
  const { t } = useTranslation();
  const router = useRouter();
  const { myPrograms, isLoading, fetchMyPrograms, deleteProgram, duplicateProgram } = useProgramStore();
  const [refreshing, setRefreshing] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { fetchMyPrograms(); }, [fetchMyPrograms]));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMyPrograms();
    setRefreshing(false);
  };

  const handleDelete = (p: Program) => {
    Alert.alert(t('programs.deleteProgram'), p.title, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteProgram(p.id);
          if (error) Alert.alert(t('common.error'), error);
        },
      },
    ]);
  };

  const handleDuplicate = async (p: Program) => {
    setDuplicating(p.id);
    const { id: newId, error } = await duplicateProgram(p.id);
    setDuplicating(null);
    if (error) { Alert.alert(t('common.error'), error); return; }
    if (newId) router.push({ pathname: '/programs/edit', params: { id: newId } });
  };

  if (isLoading && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {myPrograms.length === 0 ? (
        <TouchableOpacity
          style={styles.emptyCard}
          onPress={() => router.push('/programs/create')}
          activeOpacity={0.8}
        >
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIconPlus}>+</Text>
          </View>
          <Text style={styles.emptyTitle}>{t('programs.noPrograms')}</Text>
          <Text style={styles.emptyHint}>Tap here to create your first program</Text>
        </TouchableOpacity>
      ) : (
        myPrograms.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={styles.programCard}
            onPress={() => router.push({ pathname: '/programs/detail', params: { id: p.id } })}
            activeOpacity={0.8}
          >
            <View style={styles.programCardTop}>
              <Text style={styles.programTitle} numberOfLines={1}>{p.title}</Text>
              <DifficultyBadge level={p.difficulty} />
            </View>
            {!!p.description && (
              <Text style={styles.programDesc} numberOfLines={2}>{p.description}</Text>
            )}
            <View style={styles.programMeta}>
              <View style={styles.metaLeft}>
                <Text style={styles.metaText}>{t('programs.days', { count: p.duration_days })}</Text>
              </View>
              <View style={styles.metaActions}>
                <TouchableOpacity
                  style={styles.assignBtn}
                  onPress={() => router.push({ pathname: '/programs/assign', params: { id: p.id } })}
                >
                  <Text style={styles.assignBtnText}>{t('programs.assignToClient')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.duplicateBtn}
                  onPress={() => handleDuplicate(p)}
                  disabled={duplicating === p.id}
                >
                  {duplicating === p.id
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text style={styles.duplicateBtnText}>{t('programs.duplicateProgram')}</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(p)}>
                  <Text style={styles.deleteText}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function ClientView() {
  const { t } = useTranslation();
  const router = useRouter();
  const { assignments, isLoading, fetchAssignedPrograms } = useProgramStore();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { fetchAssignedPrograms(); }, [fetchAssignedPrograms]));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAssignedPrograms();
    setRefreshing(false);
  };

  if (isLoading && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {assignments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('programs.noAssigned')}</Text>
          <Text style={styles.emptyHint}>Your coach will assign programs here</Text>
        </View>
      ) : (
        assignments.map(({ program, current_day, id }) => (
          <TouchableOpacity
            key={id}
            style={styles.programCard}
            onPress={() => router.push({ pathname: '/programs/detail', params: { id: program.id } })}
            activeOpacity={0.8}
          >
            <View style={styles.programCardTop}>
              <Text style={styles.programTitle} numberOfLines={1}>{program.title}</Text>
              <DifficultyBadge level={program.difficulty} />
            </View>
            {!!program.description && (
              <Text style={styles.programDesc} numberOfLines={2}>{program.description}</Text>
            )}
            <View style={styles.programMeta}>
              <Text style={styles.metaText}>{t('programs.days', { count: program.duration_days })}</Text>
              <View style={styles.progressPill}>
                <Text style={styles.progressText}>Day {current_day} / {program.duration_days}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

export default function ProgramsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const isCoach = profile?.role === 'coach';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('programs.title')}</Text>
        {isCoach && (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push('/programs/create')}
          >
            <Text style={styles.createBtnText}>+ {t('programs.createProgram')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {isCoach ? <CoachView /> : <ClientView />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
  },
  createBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  createBtnText: {
    color: '#ffffff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing['3xl'],
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginTop: spacing.xl,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: `${colors.primary}18`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyIconPlus: {
    fontSize: 32,
    color: colors.primary,
    lineHeight: 36,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  programCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  programCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  programTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  programDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  programMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  metaLeft: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  marketplaceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  publishedBadge: { backgroundColor: `${colors.success}18` },
  draftBadge: { backgroundColor: `${colors.textMuted}18` },
  marketplaceBadgeText: { fontSize: fontSize.xs, fontWeight: '600' },
  publishedText: { color: colors.success },
  draftText: { color: colors.textMuted },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  metaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  assignBtn: {
    backgroundColor: `${colors.primary}14`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  assignBtnText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  deleteText: {
    color: colors.error,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  duplicateBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duplicateBtnText: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  progressPill: {
    backgroundColor: `${colors.success}18`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  progressText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
