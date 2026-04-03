import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore, isWithinNoticeWindow } from '../../src/stores/sessionStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { Profile } from '../../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(time: string): string {
  const parts = time.split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parts[1] ?? '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:${minute} ${ampm}`;
}

function statusColor(status: string): string {
  if (status === 'cancelled') return colors.error;
  if (status === 'completed') return colors.success;
  return colors.primary;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  );
}

function ParticipantRow({ participant }: { participant: Profile }) {
  return (
    <View style={styles.participantRow}>
      <Avatar name={participant.display_name} />
      <View style={styles.participantInfo}>
        <Text style={styles.participantName}>{participant.display_name}</Text>
        <Text style={styles.participantUsername}>@{participant.username}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SessionDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { profile } = useAuthStore();
  const {
    currentSession,
    fetchSessionDetail,
    cancelSession,
    cancelAsClient,
    isLoading,
    clearCurrentSession,
  } = useSessionStore();

  const isCoach = profile?.role === 'coach';

  useEffect(() => {
    if (sessionId) fetchSessionDetail(sessionId);
    return () => clearCurrentSession();
  }, [sessionId]);

  async function handleCoachCancel() {
    if (!currentSession) return;

    Alert.alert(
      t('schedule.confirmCancel'),
      t('schedule.confirmCancelDesc'),
      [
        { text: t('common.back'), style: 'cancel' },
        {
          text: t('schedule.cancelSession'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await cancelSession(currentSession.id);
            if (error) {
              Alert.alert(t('common.error'), error);
            } else {
              router.back();
            }
          },
        },
      ],
    );
  }

  async function handleClientLeave() {
    if (!currentSession) return;

    if (isWithinNoticeWindow(currentSession)) {
      Alert.alert(t('schedule.cancelNotAllowed'), t('schedule.noticeError'));
      return;
    }

    Alert.alert(
      t('schedule.confirmLeave'),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('schedule.leaveSession'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await cancelAsClient(currentSession.id);
            if (error) {
              Alert.alert(t('common.error'), error);
            } else {
              router.back();
            }
          },
        },
      ],
    );
  }

  if (isLoading || !currentSession) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>{t('schedule.sessionDetail')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const session = currentSession;
  const sColor = statusColor(session.status);
  const isCancelled = session.status === 'cancelled';
  const isCompleted = session.status === 'completed';
  const canAct = !isCancelled && !isCompleted;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('schedule.sessionDetail')}</Text>
        {isCoach && canAct ? (
          <TouchableOpacity
            style={styles.editNavBtn}
            onPress={() =>
              router.push({ pathname: '/sessions/edit', params: { sessionId: session.id } })
            }
          >
            <Text style={styles.editNavText}>{t('schedule.reschedule')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Status badge + date/time block ── */}
        <View style={styles.heroCard}>
          <View style={[styles.statusBadge, { backgroundColor: sColor + '18' }]}>
            <Text style={[styles.statusText, { color: sColor }]}>
              {t(`schedule.${session.status}` as any)}
            </Text>
          </View>

          <Text style={styles.heroDate}>{formatDate(session.date)}</Text>

          <View style={styles.heroMeta}>
            <Text style={styles.heroTime}>{formatTime(session.start_time)}</Text>
            <Text style={styles.heroBullet}>·</Text>
            <Text style={styles.heroDuration}>
              {t('schedule.min', { count: session.duration_minutes })}
            </Text>
          </View>

          {/* Capacity pill — coach only */}
          {isCoach && (
            <View style={styles.capacityPill}>
              <Text style={styles.capacityText}>
                {session.max_clients != null
                  ? t('schedule.spots', { count: session.clients.length, max: session.max_clients })
                  : t('schedule.unlimited')}
              </Text>
            </View>
          )}
        </View>

        {/* ── Participants ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('schedule.participants')}</Text>

          {isCoach ? (
            session.clients.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>{t('schedule.noParticipants')}</Text>
              </View>
            ) : (
              session.clients.map((p) => <ParticipantRow key={p.id} participant={p} />)
            )
          ) : (
            session.coachProfile ? (
              <View style={styles.participantRow}>
                <Avatar name={session.coachProfile.display_name} />
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName}>{session.coachProfile.display_name}</Text>
                  <Text style={styles.participantUsername}>
                    @{session.coachProfile.username}
                  </Text>
                </View>
              </View>
            ) : null
          )}
        </View>

        {/* ── Booking & Cancellation Policy ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('schedule.policy')}</Text>
          <View style={styles.policyCard}>
            <View style={styles.policyRow}>
              <Text style={styles.policyDot}>{'•'}</Text>
              <Text style={styles.policyText}>{t('schedule.bookingClosedAt', { hours: session.booking_cutoff_hours })}</Text>
            </View>
            <View style={[styles.policyRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.policyDot}>{'•'}</Text>
              <Text style={styles.policyText}>{t('schedule.cancellationClosedAt', { hours: session.cancellation_cutoff_hours })}</Text>
            </View>
          </View>
        </View>

        {/* ── Notes ── */}
        {session.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('schedule.notes')}</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{session.notes}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Coach actions ── */}
        {isCoach && canAct && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCoachCancel}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelBtnText}>{t('schedule.cancelSession')}</Text>
          </TouchableOpacity>
        )}

        {/* ── Client action ── */}
        {!isCoach && canAct && (
          <TouchableOpacity
            style={styles.leaveBtn}
            onPress={handleClientLeave}
            activeOpacity={0.8}
          >
            <Text style={styles.leaveBtnText}>{t('schedule.leaveSession')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon: { fontSize: 26, color: colors.primary, fontWeight: '600', lineHeight: 30 },
  navTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  editNavBtn: { paddingHorizontal: spacing.sm },
  editNavText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },

  scrollContent: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['5xl'],
  },

  // Hero block
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
    marginBottom: spacing['2xl'],
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statusBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
  },
  statusText: { fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroDate: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroTime: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  heroBullet: { fontSize: fontSize.lg, color: colors.textMuted },
  heroDuration: { fontSize: fontSize.md, color: colors.textSecondary },
  capacityPill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.borderLight,
  },
  capacityText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Sections
  section: { marginBottom: spacing['2xl'] },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  emptySection: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptySectionText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },

  // Participants
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  participantInfo: { flex: 1, marginLeft: spacing.md },
  participantName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  participantUsername: { fontSize: fontSize.xs, color: colors.textMuted },

  avatar: {
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '700' },

  // Notes
  notesCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  notesText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },

  // Action buttons
  policyCard: { backgroundColor: colors.card, borderRadius: borderRadius.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  policyRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  policyDot: { color: colors.primary, fontWeight: '800', marginRight: spacing.sm, fontSize: fontSize.md },
  policyText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  cancelBtn: {
    backgroundColor: colors.error + '12',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error + '40',
    marginTop: spacing.md,
  },
  cancelBtnText: { color: colors.error, fontSize: fontSize.md, fontWeight: '700' },

  leaveBtn: {
    backgroundColor: colors.warning + '12',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning + '40',
    marginTop: spacing.md,
  },
  leaveBtnText: { color: colors.warning, fontSize: fontSize.md, fontWeight: '700' },
});
