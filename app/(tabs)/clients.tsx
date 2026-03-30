import React, { useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
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

  useEffect(() => { fetchCoachData(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCoachData();
    setRefreshing(false);
  };

  const handleAccept = async (id: string) => {
    const { error } = await acceptRequest(id);
    if (error) Alert.alert(t('common.error'), error);
  };

  const handleReject = async (id: string, name: string) => {
    Alert.alert(t('connections.reject'), name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('connections.reject'), style: 'destructive', onPress: async () => { const { error } = await rejectRequest(id); if (error) Alert.alert(t('common.error'), error); } },
    ]);
  };

  const handleRemove = async (id: string, name: string) => {
    Alert.alert(t('connections.removeClient'), name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('connections.removeClient'), style: 'destructive', onPress: async () => { const { error } = await removeClient(id); if (error) Alert.alert(t('common.error'), error); } },
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
              <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => handleAccept(request.id)}>
                <Text style={styles.acceptBtnText}>{t('connections.accept')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleReject(request.id, p.display_name)}>
                <Text style={styles.rejectBtnText}>{t('connections.reject')}</Text>
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
              onPress={() => router.push({ pathname: '/coach/client-detail', params: { clientId: p.id, requestId: request.id } })}
              activeOpacity={0.8}>
              <Avatar name={p.display_name} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{p.display_name}</Text>
                <Text style={styles.cardUsername}>@{p.username}</Text>
              </View>
              <TouchableOpacity style={[styles.actionBtn, styles.removeBtn]} onPress={() => handleRemove(request.id, p.display_name)}>
                <Text style={styles.removeBtnText}>{t('connections.removeClient')}</Text>
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
  const [coachUsername, setCoachUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchClientData(); }, []);

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

  const handleCancel = async () => {
    Alert.alert(t('common.cancel'), '', [
      { text: t('common.back'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: async () => { const { error } = await cancelRequest(); if (error) Alert.alert(t('common.error'), error); } },
    ]);
  };

  const handleDisconnect = async () => {
    Alert.alert(t('connections.disconnect'), myCoach?.display_name ?? '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('connections.disconnect'), style: 'destructive', onPress: async () => { const { error } = await disconnectFromCoach(); if (error) Alert.alert(t('common.error'), error); } },
    ]);
  };

  if (isLoading && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
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
            <TouchableOpacity style={[styles.actionBtn, styles.removeBtn]} onPress={handleDisconnect}>
              <Text style={styles.removeBtnText}>{t('connections.disconnect')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {myRequest?.status === 'pending' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('connections.pendingRequests')}</Text>
          <View style={styles.pendingCard}>
            <Text style={styles.pendingText}>{t('connections.requestPending')}</Text>
            <TouchableOpacity style={[styles.actionBtn, styles.removeBtn]} onPress={handleCancel}>
              <Text style={styles.removeBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.text },
  container: { flex: 1 },
  content: { padding: spacing['2xl'], paddingBottom: 100, gap: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shareCard: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.sm },
  shareLabel: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)' },
  usernameTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  usernameTagText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textInverse },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  requestCard: { backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  clientCard: { backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  coachCard: { backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  pendingCard: { backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.borderLight },
  pendingText: { fontSize: fontSize.sm, color: colors.warning, fontWeight: '600' },
  emptyCard: { backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing['2xl'], alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  cardUsername: { fontSize: fontSize.sm, color: colors.textMuted },
  avatar: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.textInverse, fontWeight: '700' },
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  acceptBtn: { backgroundColor: colors.success },
  acceptBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textInverse },
  rejectBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.error },
  rejectBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.error },
  removeBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  removeBtnText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  connectedBadge: { alignSelf: 'flex-start', backgroundColor: `${colors.success}18`, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 2 },
  connectedText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.success },
  searchCard: { backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.text, paddingVertical: spacing.xs },
  sendBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 80, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textInverse },
});
