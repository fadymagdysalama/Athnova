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
import { supabase } from '../../src/lib/supabase';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { Profile } from '../../src/types';

function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  );
}

export default function ClientDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { clientId, requestId } = useLocalSearchParams<{ clientId: string; requestId: string }>();
  const { removeClient } = useConnectionStore();

  const [client, setClient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', clientId)
      .single()
      .then(({ data }) => {
        setClient(data);
        setLoading(false);
      });
  }, [clientId]);

  const handleRemove = () => {
    if (!requestId || !client) return;
    Alert.alert(
      t('connections.removeClient'),
      client.display_name,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('connections.removeClient'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await removeClient(requestId);
            if (error) {
              Alert.alert(t('common.error'), error);
            } else {
              router.back();
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!client) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
      </View>
    );
  }

  const joinedDate = new Date(client.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <Avatar name={client.display_name} size={72} />
          <Text style={styles.displayName}>{client.display_name}</Text>
          <Text style={styles.username}>@{client.username}</Text>
          <View style={styles.roleTag}>
            <Text style={styles.roleText}>{t('profile.client')}</Text>
          </View>
        </View>

        {/* Info rows */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('connections.clientSince', { date: joinedDate })}</Text>
          </View>
        </View>

        {/* Progress */}
        <TouchableOpacity
          style={styles.progressButton}
          onPress={() =>
            router.push({
              pathname: '/coach/client-progress',
              params: { clientId, clientName: client.display_name },
            })
          }
        >
          <Text style={styles.progressButtonText}>📊  {t('progress.viewProgress')}</Text>
        </TouchableOpacity>

        {/* Danger zone */}
        <View style={styles.dangerSection}>
          <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
            <Text style={styles.removeButtonText}>{t('connections.removeClient')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    padding: spacing['2xl'],
    gap: spacing.lg,
    paddingBottom: 60,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },

  // Profile card
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  displayName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  username: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  roleTag: {
    backgroundColor: `${colors.primary}18`,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  roleText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },

  // Info card
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Progress button
  progressButton: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  progressButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },

  // Danger zone
  dangerSection: {
    marginTop: spacing.md,
  },
  removeButton: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  removeButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.error,
  },
});
