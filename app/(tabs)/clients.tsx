import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

function CoachView() {
  const { t } = useTranslation();
  const router = useRouter();
  const { pendingRequests, clients, isLoading, fetchCoachData, acceptRequest, rejectRequest, removeClient } = useConnectionStore();
  const { profile } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Refresh data every time the tab comes into focus
  useFocusEffect(
    useCallback(() => { fetchCoachData(); }, [])
  );

  // Real-time: silent refresh (no spinner) on any row change
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`coach-client-requests:coach:${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_client_requests', filter: `coach_id=eq.${profile.id}` },
        () => { fetchCoachData(true); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCoachData();
    setRefreshing(false);
  };

  const handleAccept = async (id: string) => {
    if (acceptingId) return;
    setAcceptingId(id);
    const { error } = await acceptRequest(id);
    setAcceptingId(null);
    if (error) Alert.alert(t('common.error'), error);
  };

  const handleReject = async (id: string, name: string) => {
    if (rejectingId) return;
    Alert.alert(t('connections.reject'), name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('connections.reject'), style: 'destructive',
        onPress: async () => {
          setRejectingId(id);
          const { error } = await rejectRequest(id);
          setRejectingId(null);
          if (error) Alert.alert(t('common.error'), error);
        },
      },
    ]);
  };

  const handleRemove = async (id: string, name: string) => {
    if (removingId) return;
    Alert.alert(t('connections.removeClient'), name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('connections.removeClient'), style: 'destructive',
        onPress: async () => {
          setRemovingId(id);
          const { error } = await removeClient(id);
          setRemovingId(null);
          if (error) Alert.alert(t('common.error'), error);
        },
      },
    ]);
  };

  if (isLoading && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      <View style={styles.shareCard}>
        <Text style={styles.shareLabel}>{t('connections.shareCodeHint')}</Text>
        <View style={styles.usernameTag}>
          <Text style={styles.usernameTagText}>@{profile?.username}</Text>
        </View>
      </View>

      {pendingRequests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('connections.pendingRequests')} ({pendingRequests.length})</Text>
          {pendingRequests.map(({ profile: p, request }) => (
            <View key={request.id} style={styles.requestCard}>
              <Avatar name={p.display_name} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{p.display_name}</Text>
                <Text style={styles.cardUsername}>@{p.username}</Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn, (acceptingId === request.id || rejectingId === request.id) && styles.btnDisabled]}
                onPress={() => handleAccept(request.id)}
                disabled={!!acceptingId || !!rejectingId}
              >
                {acceptingId === request.id
                  ? <ActivityIndicator size="small" color={colors.textInverse} />
                  : <Text style={styles.acceptBtnText}>{t('connections.accept')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn, (acceptingId === request.id || rejectingId === request.id) && styles.btnDisabled]}
                onPress={() => handleReject(request.id, p.display_name)}
                disabled={!!acceptingId || !!rejectingId}
              >
                {rejectingId === request.id
                  ? <ActivityIndicator size="small" color={colors.error} />
                  : <Text style={styles.rejectBtnText}>{t('connections.reject')}</Text>}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('connections.title')}</Text>
        {clients.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>{t('connections.noClients')}</Text></View>
        ) : (
          clients.map(({ profile: p, request }) => (
            <TouchableOpacity key={request.id} style={styles.clientCard}
              onPress={() => router.push({ pathname: '/coach/client-progress', params: { clientId: p.id, clientName: p.display_name } })}
              activeOpacity={0.8}>
              <Avatar name={p.display_name} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{p.display_name}</Text>
                <Text style={styles.cardUsername}>@{p.username}</Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.removeBtn, removingId === request.id && styles.btnDisabled]}
                onPress={() => handleRemove(request.id, p.display_name)}
                disabled={!!removingId}
              >
                {removingId === request.id
                  ? <ActivityIndicator size="small" color={colors.textMuted} />
                  : <Text style={styles.removeBtnText}>{t('connections.removeClient')}</Text>}
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function ClientView() {
  const { t } = useTranslation();
  const { myCoach, myRequest, isLoading, fetchClientData, sendRequest, cancelRequest, disconnectFromCoach } = useConnectionStore();
  const { profile } = useAuthStore();
  const [coachUsername, setCoachUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Refresh data every time the tab comes into focus
  useFocusEffect(
    useCallback(() => { fetchClientData(); }, [])
  );

  // Real-time: silent refresh (no spinner) on any row change
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`coach-client-requests:client:${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_client_requests', filter: `client_id=eq.${profile.id}` },
        () => { fetchClientData(true); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchClientData();
    setRefreshing(false);
  };

  const handleSend = async () => {
    const trimmed = coachUsername.trim().replace(/^@/, '');
    if (!trimmed) return;
    setSending(true);
    const { error } = await sendRequest(trimmed);
    setSending(false);
    if (error) Alert.alert(t('common.error'), error);
    else setCoachUsername('');
  };

  const handleCancel = () => {
    const pendingCoach = myRequest?.coach;
    Alert.alert(
      t('connections.cancelRequest'),
      pendingCoach ? `@${pendingCoach.username}` : '',
      [
        { text: t('common.back'), style: 'cancel' },
        {
          text: t('connections.cancelRequest'), style: 'destructive',
          onPress: async () => {
            setCanceling(true);
            const { error } = await cancelRequest();
            setCanceling(false);
            if (error) Alert.alert(t('common.error'), error);
          },
        },
      ],
    );
  };

  const handleDisconnect = async () => {
    Alert.alert(t('connections.disconnect'), myCoach?.display_name ?? '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('connections.disconnect'), style: 'destructive',
        onPress: async () => {
          setDisconnecting(true);
          const { error } = await disconnectFromCoach();
          setDisconnecting(false);
          if (error) Alert.alert(t('common.error'), error);
        },
      },
    ]);
  };

  // The request row always includes the joined coach profile
  const pendingCoach = myRequest?.coach;

  if (isLoading && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

      {/* ── Connected to a coach ── */}
      {myCoach && myRequest?.status === 'accepted' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('connections.myCoach')}</Text>
          <View style={styles.coachCard}>
            <Avatar name={myCoach.display_name} size={52} />
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{myCoach.display_name}</Text>
              <Text style={styles.cardUsername}>@{myCoach.username}</Text>
              <View style={styles.connectedBadge}>
                <Text style={styles.connectedText}>{t('connections.connected')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, styles.removeBtn, disconnecting && styles.btnDisabled]}
              onPress={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting
                ? <ActivityIndicator size="small" color={colors.textMuted} />
                : <Text style={styles.removeBtnText}>{t('connections.disconnect')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Pending request (shows coach info) ── */}
      {myRequest?.status === 'pending' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('connections.pendingRequests')}</Text>
          <View style={styles.pendingCard}>
            {pendingCoach && <Avatar name={pendingCoach.display_name} />}
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{pendingCoach?.display_name ?? t('connections.coach')}</Text>
              <Text style={styles.cardUsername}>@{pendingCoach?.username}</Text>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{t('connections.awaitingResponse')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, canceling && styles.btnDisabled]}
              onPress={handleCancel}
              disabled={canceling}
            >
              {canceling
                ? <ActivityIndicator size="small" color={colors.error} />
                : <Text style={styles.rejectBtnText}>{t('common.cancel')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── No coach yet ── */}
      {!myCoach && !myRequest && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('connections.connectCoach')}</Text>
          <View style={styles.searchCard}>
            <TextInput
              style={styles.searchInput}
              placeholder={t('connections.enterUsername')}
              placeholderTextColor={colors.textMuted}
              value={coachUsername}
              onChangeText={setCoachUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!coachUsername.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!coachUsername.trim() || sending}>
              {sending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.sendBtnText}>{t('connections.sendRequest')}</Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('connections.noCoach')}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

export default function ClientsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuthStore();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {profile?.role === 'coach' ? t('connections.title') : t('connections.myCoach')}
        </Text>
      </View>
      {profile?.role === 'coach' ? <CoachView /> : <ClientView />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 60,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.background,
  },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  container: { flex: 1 },
  content: { padding: spacing['2xl'], paddingBottom: 100, gap: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shareCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  shareLabel: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  usernameTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  usernameTagText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textInverse, letterSpacing: 0.3 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  requestCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  clientCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  coachCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pendingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.warningFaded,
  },
  pendingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warningFaded,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 2,
  },
  pendingBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.warning },
  pendingText: { fontSize: fontSize.sm, color: colors.warning, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  cardUsername: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '400' },
  avatar: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.textInverse, fontWeight: '800' },
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 1, borderRadius: borderRadius.md },
  acceptBtn: { backgroundColor: colors.success },
  acceptBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textInverse },
  rejectBtn: { backgroundColor: colors.errorFaded, borderWidth: 1, borderColor: colors.error + '40' },
  rejectBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.error },
  removeBtn: { backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
  removeBtnText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  connectedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successFaded,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 2,
  },
  connectedText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  searchCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.text, paddingVertical: spacing.xs },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 80,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textInverse },
});
