import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useProgramStore } from '../../src/stores/programStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { Profile } from '../../src/types';

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

export default function AssignProgramScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id: programId } = useLocalSearchParams<{ id: string }>();
  const { clients, fetchCoachData } = useConnectionStore();
  const { assignProgram, unassignProgram, fetchProgramAssignments } = useProgramStore();

  const [assignedClientIds, setAssignedClientIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchCoachData();
      if (programId) {
        const ids = await fetchProgramAssignments(programId);
        setAssignedClientIds(ids);
      }
      setLoading(false);
    };
    init();
  }, [programId]);

  const handleToggle = async (clientProfile: Profile) => {
    if (!programId) return;
    const isAssigned = assignedClientIds.includes(clientProfile.id);
    setToggling(clientProfile.id);

    if (isAssigned) {
      const { error } = await unassignProgram(programId, clientProfile.id);
      if (error) Alert.alert(t('common.error'), error);
      else setAssignedClientIds((ids) => ids.filter((id) => id !== clientProfile.id));
    } else {
      const { error } = await assignProgram(programId, clientProfile.id);
      if (error) Alert.alert(t('common.error'), error);
      else setAssignedClientIds((ids) => [...ids, clientProfile.id]);
    }

    setToggling(null);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('programs.assignProgram')}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : clients.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('connections.noClients')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>{t('programs.selectClient')}</Text>
          {clients.map(({ profile }) => {
            const isAssigned = assignedClientIds.includes(profile.id);
            const isBusy = toggling === profile.id;
            return (
              <TouchableOpacity
                key={profile.id}
                style={[styles.clientRow, isAssigned && styles.clientRowActive]}
                onPress={() => handleToggle(profile)}
                activeOpacity={0.8}
                disabled={isBusy}
              >
                <Avatar name={profile.display_name} />
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{profile.display_name}</Text>
                  <Text style={styles.clientUsername}>@{profile.username}</Text>
                </View>
                {isBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : isAssigned ? (
                  <View style={styles.assignedBadge}>
                    <Text style={styles.assignedBadgeText}>{t('programs.assigned')}</Text>
                  </View>
                ) : (
                  <View style={styles.unassignedBadge}>
                    <Text style={styles.unassignedBadgeText}>{t('programs.assignToClient')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 60, paddingBottom: spacing.lg, paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted },
  content: { padding: spacing['2xl'], gap: spacing.sm, paddingBottom: 60 },
  hint: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs,
  },
  clientRow: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.md, flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  clientRowActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}08` },
  avatar: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.textInverse, fontWeight: '700' },
  clientInfo: { flex: 1, gap: 2 },
  clientName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  clientUsername: { fontSize: fontSize.sm, color: colors.textMuted },
  assignedBadge: {
    backgroundColor: `${colors.success}18`, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  assignedBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  unassignedBadge: {
    backgroundColor: colors.primary, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  unassignedBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textInverse },
});
