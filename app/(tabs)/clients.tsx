import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
  Pressable,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useOfflineClientStore } from '../../src/stores/offlineClientStore';
import { useProgramStore } from '../../src/stores/programStore';
import { supabase } from '../../src/lib/supabase';
import { invokeEdgeFunction } from '../../src/lib/invokeEdgeFunction';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { OfflineClient, Program } from '../../src/types';

function formatJoinedDate(iso: string): string {
  const d = new Date(iso);
  return 'Joined ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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
  const { pendingRequests, clients, isLoading, fetchCoachData, acceptRequest, rejectRequest, removeClient, changeClientMode } = useConnectionStore();
  const { offlineClients, fetchOfflineClients, addOfflineClient, deleteOfflineClient } = useOfflineClientStore();
  const { myPrograms, coachAssignments, fetchMyPrograms, fetchCoachAssignments, assignProgramToOffline, unassignProgramFromOffline } = useProgramStore();
  const { profile } = useAuthStore();

  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Inline offline program data per offline/on-ground-app client
  const [offlineProgMap, setOfflineProgMap] = useState<Record<string, { title: string; pct: number }[]>>({});
  // Same data keyed by linked_profile_id (for on-ground app clients)
  const [offlineProgByLinkedId, setOfflineProgByLinkedId] = useState<Record<string, { title: string; pct: number }[]>>({});

  // ··· action sheet
  type MenuModal =
    | { type: 'online'; requestId: string; name: string; mode: 'online' | 'offline' }
    | { type: 'offline'; oc: OfflineClient };
  const [menuModal, setMenuModal] = useState<MenuModal | null>(null);

  // On-ground client modal state
  const [showAddWalkup, setShowAddWalkup] = useState(false);
  const [walkupName, setWalkupName] = useState('');
  const [walkupPhone, setWalkupPhone] = useState('');

  // ── AI assistant state ────────────────────────────────────────────────────
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAiAsk = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiAnswer(null);
    const { data, error } = await invokeEdgeFunction<{ answer: string }>('ai-clients-assistant', { question: aiQuestion.trim() });
    setAiLoading(false);
    if (error || !data?.answer) {
      setAiError(error ?? 'No response from AI. Please try again.');
      return;
    }
    setAiAnswer(data.answer);
  };
  const [savingWalkup, setSavingWalkup] = useState(false);

  // Program picker for on-ground clients
  const [programPickerClient, setProgramPickerClient] = useState<OfflineClient | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerAssignedIds, setPickerAssignedIds] = useState<string[]>([]);
  const [pickerToggling, setPickerToggling] = useState<string | null>(null);
  const [acceptModal, setAcceptModal] = useState<{ id: string; displayName: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string; subtitle?: string; confirmText: string;
    destructive?: boolean; onConfirm: () => void | Promise<void>;
  } | null>(null);
  const { alertProps, showAlert } = useAppAlert();

  const loadUnreadCounts = async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('coach_client_messages')
      .select('client_id')
      .eq('coach_id', profile.id)
      .neq('sender_id', profile.id)
      .eq('is_read', false);
    const counts: Record<string, number> = {};
    for (const row of (data ?? [])) {
      counts[row.client_id] = (counts[row.client_id] ?? 0) + 1;
    }
    setUnreadCounts(counts);
  };

  const loadOfflinePrograms = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [assignRes, ocRes] = await Promise.all([
      supabase
        .from('offline_program_assignments')
        .select('offline_client_id, current_day, programs(title, duration_days)')
        .order('started_at', { ascending: false }),
      supabase
        .from('offline_clients')
        .select('id, linked_profile_id')
        .not('linked_profile_id', 'is', null),
    ]);
    // Build offline_client_id → linked_profile_id lookup
    const linkedIdLookup: Record<string, string> = {};
    for (const oc of (ocRes.data ?? []) as any[]) {
      if (oc.linked_profile_id) linkedIdLookup[oc.id] = oc.linked_profile_id;
    }
    const map: Record<string, { title: string; pct: number }[]> = {};
    const linkedMap: Record<string, { title: string; pct: number }[]> = {};
    for (const a of (assignRes.data ?? []) as any[]) {
      const pct = a.programs?.duration_days > 0
        ? Math.min(Math.round(((a.current_day - 1) / a.programs.duration_days) * 100), 100)
        : 0;
      const entry = { title: a.programs?.title ?? 'Program', pct };
      if (!map[a.offline_client_id]) map[a.offline_client_id] = [];
      map[a.offline_client_id].push(entry);
      const linkedId = linkedIdLookup[a.offline_client_id];
      if (linkedId) {
        if (!linkedMap[linkedId]) linkedMap[linkedId] = [];
        linkedMap[linkedId].push(entry);
      }
    }
    setOfflineProgMap(map);
    setOfflineProgByLinkedId(linkedMap);
  };

  useFocusEffect(
    useCallback(() => {
      fetchCoachData();
      fetchOfflineClients();
      loadUnreadCounts();
      fetchCoachAssignments();
      loadOfflinePrograms();
    }, [])
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
    await Promise.all([fetchCoachData(), fetchOfflineClients(), fetchCoachAssignments(), loadOfflinePrograms()]);
    setRefreshing(false);
  };

  const handleAccept = (id: string, displayName: string) => {
    if (acceptingId) return;
    setAcceptModal({ id, displayName });
  };

  const handleReject = (id: string, name: string) => {
    if (rejectingId) return;
    setConfirmModal({
      title: t('connections.reject'),
      subtitle: name,
      confirmText: t('connections.reject'),
      destructive: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setRejectingId(id);
        const { error } = await rejectRequest(id);
        setRejectingId(null);
        if (error) showAlert({ title: t('common.error'), message: error });
      },
    });
  };

  const handleRemove = (id: string, name: string) => {
    if (removingId) return;
    setConfirmModal({
      title: t('connections.removeClient'),
      subtitle: name,
      confirmText: t('connections.removeClient'),
      destructive: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setRemovingId(id);
        const { error } = await removeClient(id);
        setRemovingId(null);
        if (error) showAlert({ title: t('common.error'), message: error });
      },
    });
  };

  const handleDeleteWalkup = (oc: OfflineClient) => {
    setConfirmModal({
      title: 'Remove On Ground Client',
      subtitle: oc.display_name,
      confirmText: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        setConfirmModal(null);
        const { error } = await deleteOfflineClient(oc.id);
        if (error) showAlert({ title: t('common.error'), message: error });
      },
    });
  };

  const handleSaveWalkup = async () => {
    if (!walkupName.trim()) return;
    setSavingWalkup(true);
    const { error } = await addOfflineClient({ display_name: walkupName.trim(), phone: walkupPhone.trim() });
    setSavingWalkup(false);
    if (error) {
      setShowAddWalkup(false);
      showAlert({ title: t('common.error'), message: error });
      return;
    }
    setWalkupName('');
    setWalkupPhone('');
    setShowAddWalkup(false);
  };

  const openOfflineProgramPicker = async (oc: OfflineClient) => {
    setProgramPickerClient(oc);
    setPickerLoading(true);
    await fetchMyPrograms();
    const { data } = await supabase
      .from('offline_program_assignments')
      .select('program_id')
      .eq('offline_client_id', oc.id);
    setPickerAssignedIds((data ?? []).map((r: any) => r.program_id));
    setPickerLoading(false);
  };

  const handleMoveToGround = (requestId: string, displayName: string) => {
    setConfirmModal({
      title: 'Move to On Ground',
      subtitle: `${displayName} will be switched to On Ground mode. They keep app access with schedule, chat, and session history.`,
      confirmText: 'Move',
      onConfirm: async () => {
        setConfirmModal(null);
        const { error } = await changeClientMode(requestId, 'offline');
        if (error) showAlert({ title: t('common.error'), message: error });
      },
    });
  };

  const handleMoveToOnline = (requestId: string, name: string) => {
    setConfirmModal({
      title: 'Move to Online',
      subtitle: `${name} will be upgraded to full online access.`,
      confirmText: 'Move to Online',
      onConfirm: async () => {
        setConfirmModal(null);
        const { error } = await changeClientMode(requestId, 'online');
        if (error) showAlert({ title: t('common.error'), message: error });
      },
    });
  };

  const handlePickerToggle = async (programId: string) => {
    if (!programPickerClient) return;
    setPickerToggling(programId);
    const isAssigned = pickerAssignedIds.includes(programId);
    if (isAssigned) {
      const { error } = await unassignProgramFromOffline(programId, programPickerClient.id);
      if (!error) setPickerAssignedIds((ids) => ids.filter((id) => id !== programId));
    } else {
      const { error } = await assignProgramToOffline(programId, programPickerClient.id);
      if (!error) setPickerAssignedIds((ids) => [...ids, programId]);
    }
    setPickerToggling(null);
  };

  if (isLoading && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View style={styles.shareCard}>
          <Text style={styles.shareLabel}>{t('connections.shareCodeHint')}</Text>
          <View style={styles.usernameTag}>
            <Text style={styles.usernameTagText}>@{profile?.username}</Text>
          </View>
        </View>

        {/* ── AI Assistant ── */}
        <View style={styles.aiAssistantCard}>
          <TouchableOpacity
            style={styles.aiAssistantHeader}
            onPress={() => { setShowAiPanel((v) => !v); setAiAnswer(null); setAiError(null); }}
            activeOpacity={0.8}
          >
            <Text style={styles.aiAssistantIcon}>✦</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiAssistantTitle}>AI Clients Assistant</Text>
              <Text style={styles.aiAssistantSub}>Ask anything about your clients</Text>
            </View>
            <Text style={styles.aiAssistantChevron}>{showAiPanel ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showAiPanel && (
            <View style={styles.aiAssistantBody}>
              <TextInput
                style={styles.aiAssistantInput}
                placeholder="e.g. Who hasn't had an active session this week? How is Ahmed progressing?"
                placeholderTextColor={colors.textMuted}
                value={aiQuestion}
                onChangeText={(v) => { setAiQuestion(v); setAiAnswer(null); setAiError(null); }}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
              {aiError && <Text style={styles.aiAssistantError}>{aiError}</Text>}
              {aiAnswer && (
                <View style={styles.aiAnswerBox}>
                  <Text style={styles.aiAnswerText}>{aiAnswer}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.aiAssistantBtn, (aiLoading || !aiQuestion.trim()) && styles.aiAssistantBtnDisabled]}
                onPress={handleAiAsk}
                disabled={aiLoading || !aiQuestion.trim()}
                activeOpacity={0.8}
              >
                {aiLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.aiAssistantBtnText}>✦ Ask AI</Text>
                }
              </TouchableOpacity>
            </View>
          )}
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
                  onPress={() => handleAccept(request.id, p.display_name)}
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

        {/* ── Online Clients ── */}
        {(() => {
          const onlineClients = clients.filter(({ request }) => ((request as any).client_mode ?? 'online') === 'online');
          return (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionTitle}>Online Clients</Text>
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountText}>{onlineClients.length}</Text>
                  </View>
                </View>
              </View>
              {onlineClients.length === 0 ? (
                <View style={styles.emptyCard}><Text style={styles.emptyText}>{t('connections.noClients')}</Text></View>
              ) : (
                onlineClients.map(({ profile: p, request }) => {
                  const activeAssignments = coachAssignments.filter(a => a.client?.id === p.id);
                  const unread = unreadCounts[p.id] ?? 0;
                  return (
                    <TouchableOpacity
                      key={request.id}
                      style={styles.clientCard2}
                      activeOpacity={0.85}
                      onPress={() => router.push({
                        pathname: '/coach/client-progress',
                        params: { clientId: p.id, clientName: p.display_name, clientMode: 'online', coachId: profile?.id },
                      })}
                    >
                      {/* Card top: avatar + name + badge + ··· */}
                      <View style={styles.clientCard2Top}>
                        <View style={{ position: 'relative' }}>
                          <Avatar name={p.display_name} />
                          {unread > 0 && (
                            <View style={styles.unreadDot}>
                              <Text style={styles.unreadDotText}>{unread}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardName}>{p.display_name}</Text>
                          <Text style={styles.cardUsername}>@{p.username}</Text>
                          <Text style={styles.cardJoinedDate}>{formatJoinedDate(request.created_at)}</Text>
                        </View>
                        <View style={styles.onlineBadgePill}>
                          <Text style={styles.onlineBadgeText}>Online</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.optionsBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={(e) => { e.stopPropagation(); setMenuModal({ type: 'online', requestId: request.id, name: p.display_name, mode: 'online' }); }}
                        >
                          <Text style={styles.optionsBtnText}>···</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Inline program summary */}
                      {activeAssignments.length > 0 ? (
                        <View style={styles.inlineProg}>
                          {activeAssignments.slice(0, 2).map(a => {
                            const pct = Math.min(Math.round((a.completed_days / Math.max(a.program_duration_days, 1)) * 100), 100);
                            const pColor = pct < 20 ? colors.warning : pct < 60 ? colors.accent : colors.success;
                            return (
                              <View key={a.assignment_id} style={styles.inlineProgRow}>
                                <View style={[styles.inlineProgDot, { backgroundColor: pColor }]} />
                                <Text style={styles.inlineProgName} numberOfLines={1}>{a.program_title}</Text>
                                <View style={styles.inlineProgTrack}>
                                  <View style={[styles.inlineProgFill, { width: `${pct}%` as any, backgroundColor: pColor }]} />
                                </View>
                                <Text style={[styles.inlineProgPct, { color: pColor }]}>{pct}%</Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <View style={styles.inlineProgEmpty}>
                          <Text style={styles.inlineProgEmptyText}>No program assigned</Text>
                        </View>
                      )}

                      {/* Bottom action bar: Chat + Build Program */}
                      <View style={styles.quickActions}>
                        <TouchableOpacity
                          style={[styles.quickActionBtn, styles.quickActionBtnPrimary]}
                          onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/chat/conversation', params: { coachId: profile?.id, clientId: p.id, otherName: p.display_name } }); }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.quickActionIcon}>💬</Text>
                          <Text style={[styles.quickActionText, { color: unread > 0 ? colors.error : colors.primary }]}>
                            {unread > 0 ? `Chat · ${unread} new` : 'Message'}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.quickActionDivider} />
                        <TouchableOpacity
                          style={styles.quickActionBtn}
                          onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/programs/create', params: { clientPreselect: p.id, clientName: p.display_name } }); }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.quickActionIcon}>🏋️</Text>
                          <Text style={styles.quickActionText}>Build Program</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          );
        })()}

        {/* ── On Ground Clients ── */}
        {(() => {
          const onGroundAppClients = clients.filter(({ request }) => ((request as any).client_mode ?? 'online') === 'offline');
          const totalOnGround = onGroundAppClients.length + offlineClients.length;
          return (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionDot, { backgroundColor: colors.warning }]} />
                  <Text style={styles.sectionTitle}>On Ground Clients</Text>
                  <View style={[styles.sectionCountPill, { backgroundColor: colors.warningFaded }]}>
                    <Text style={[styles.sectionCountText, { color: colors.warning }]}>{totalOnGround}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.addWalkupBtn} onPress={() => setShowAddWalkup(true)}>
                  <Text style={styles.addWalkupBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.walkupHint}>Unlimited — never count toward your plan limit</Text>

              {/* On Ground clients who have the app */}
              {onGroundAppClients.map(({ profile: p, request }) => {
                const unread = unreadCounts[p.id] ?? 0;
                const onGroundProgs = offlineProgByLinkedId[p.id] ?? [];
                return (
                  <TouchableOpacity
                    key={request.id}
                    style={styles.clientCard2}
                    activeOpacity={0.85}
                    onPress={() => router.push({ pathname: '/coach/offline-client-detail', params: { linkedClientId: p.id, clientName: p.display_name, coachId: profile?.id } })}
                  >
                    <View style={styles.clientCard2Top}>
                      <View style={{ position: 'relative' }}>
                        <Avatar name={p.display_name} />
                        {unread > 0 && (
                          <View style={styles.unreadDot}>
                            <Text style={styles.unreadDotText}>{unread}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardName}>{p.display_name}</Text>
                        <Text style={styles.cardUsername}>@{p.username}</Text>
                        <Text style={styles.cardJoinedDate}>{formatJoinedDate(request.created_at)}</Text>
                      </View>
                      <View style={styles.offlineBadgePill}>
                        <Text style={styles.offlineBadgeText}>On Ground</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.optionsBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={(e) => { e.stopPropagation(); setMenuModal({ type: 'online', requestId: request.id, name: p.display_name, mode: 'offline' }); }}
                      >
                        <Text style={styles.optionsBtnText}>···</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Inline program summary */}
                    {onGroundProgs.length > 0 ? (
                      <View style={styles.inlineProg}>
                        {onGroundProgs.slice(0, 2).map((prog, i) => {
                          const pColor = prog.pct < 20 ? colors.warning : prog.pct < 60 ? colors.accent : colors.success;
                          return (
                            <View key={i} style={styles.inlineProgRow}>
                              <View style={[styles.inlineProgDot, { backgroundColor: pColor }]} />
                              <Text style={styles.inlineProgName} numberOfLines={1}>{prog.title}</Text>
                              <View style={styles.inlineProgTrack}>
                                <View style={[styles.inlineProgFill, { width: `${prog.pct}%` as any, backgroundColor: pColor }]} />
                              </View>
                              <Text style={[styles.inlineProgPct, { color: pColor }]}>{prog.pct}%</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.inlineProgEmpty}>
                        <Text style={styles.inlineProgEmptyText}>No program assigned</Text>
                      </View>
                    )}

                    {/* Bottom action bar */}
                    <View style={styles.quickActions}>
                      <TouchableOpacity
                        style={[styles.quickActionBtn, styles.quickActionBtnPrimary]}
                        onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/chat/conversation', params: { coachId: profile?.id, clientId: p.id, otherName: p.display_name } }); }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.quickActionIcon}>💬</Text>
                        <Text style={[styles.quickActionText, { color: unread > 0 ? colors.error : colors.primary }]}>
                          {unread > 0 ? `Chat · ${unread} new` : 'Message'}
                        </Text>
                      </TouchableOpacity>
                      <View style={styles.quickActionDivider} />
                      <TouchableOpacity
                        style={styles.quickActionBtn}
                        onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/programs/create', params: { clientPreselect: p.id, clientName: p.display_name } }); }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.quickActionIcon}>🏋️</Text>
                        <Text style={styles.quickActionText}>Build Program</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* On Ground clients without the app (manual) */}
              {offlineClients.length === 0 && onGroundAppClients.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No on ground clients yet. Tap + Add to register a name.</Text>
                </View>
              ) : (
                offlineClients.map((oc) => {
                  const progs = offlineProgMap[oc.id] ?? [];
                  return (
                    <TouchableOpacity
                      key={oc.id}
                      style={styles.clientCard2}
                      activeOpacity={0.85}
                      onPress={() => router.push({ pathname: '/coach/offline-client-detail', params: { offlineClientId: oc.id, clientName: oc.display_name } })}
                    >
                      <View style={styles.clientCard2Top}>
                        <Avatar name={oc.display_name} size={40} />
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardName}>{oc.display_name}</Text>
                          {!!oc.phone && <Text style={styles.cardUsername}>{oc.phone}</Text>}
                          <Text style={styles.cardJoinedDate}>{formatJoinedDate(oc.created_at)}</Text>
                        </View>
                        <View style={styles.walkupBadgePill}>
                          <Text style={styles.walkupBadgeText}>No App</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.optionsBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={(e) => { e.stopPropagation(); setMenuModal({ type: 'offline', oc }); }}
                        >
                          <Text style={styles.optionsBtnText}>···</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Inline program summary */}
                      {progs.length > 0 ? (
                        <View style={styles.inlineProg}>
                          {progs.slice(0, 2).map((prog, i) => {
                            const pColor = prog.pct < 20 ? colors.warning : prog.pct < 60 ? colors.accent : colors.success;
                            return (
                              <View key={i} style={styles.inlineProgRow}>
                                <View style={[styles.inlineProgDot, { backgroundColor: pColor }]} />
                                <Text style={styles.inlineProgName} numberOfLines={1}>{prog.title}</Text>
                                <View style={styles.inlineProgTrack}>
                                  <View style={[styles.inlineProgFill, { width: `${prog.pct}%` as any, backgroundColor: pColor }]} />
                                </View>
                                <Text style={[styles.inlineProgPct, { color: pColor }]}>{prog.pct}%</Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <View style={styles.inlineProgEmpty}>
                          <Text style={styles.inlineProgEmptyText}>No program assigned</Text>
                        </View>
                      )}

                      {/* Bottom action bar — Build Program only; assign from inside client profile */}
                      <View style={styles.quickActions}>
                        <TouchableOpacity
                          style={[styles.quickActionBtn, styles.quickActionBtnPrimary]}
                          onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/programs/create', params: { offlineClientPreselect: oc.id, clientName: oc.display_name } }); }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.quickActionIcon}>🏋️</Text>
                          <Text style={styles.quickActionText}>Build Program</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          );
        })()}
      </ScrollView>

      {/* ── Client action sheet (\u00b7\u00b7\u00b7 menu) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <Modal visible={!!menuModal} transparent animationType="fade" onRequestClose={() => setMenuModal(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuModal(null)}>
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>
              {menuModal?.type === 'online' ? menuModal.name : menuModal?.oc.display_name ?? ''}
            </Text>
            {menuModal?.type === 'online' ? (
              <>
                {menuModal.mode === 'online' ? (
                  <TouchableOpacity
                    style={styles.menuOption}
                    onPress={() => { setMenuModal(null); handleMoveToGround(menuModal.requestId, menuModal.name); }}
                  >
                    <View style={styles.menuOptionText}>
                      <Text style={styles.menuOptionTitle}>Move to On Ground</Text>
                      <Text style={styles.menuOptionSub}>Removes online connection, adds to on ground list</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.menuOption}
                    onPress={() => { setMenuModal(null); handleMoveToOnline(menuModal.requestId, menuModal.name); }}
                  >
                    <View style={styles.menuOptionText}>
                      <Text style={styles.menuOptionTitle}>Move to Online</Text>
                      <Text style={styles.menuOptionSub}>Grants full app access to this client</Text>
                    </View>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.menuOption, styles.menuOptionDestructive]}
                  onPress={() => { setMenuModal(null); handleRemove(menuModal.requestId, menuModal.name); }}
                >
                  <View style={styles.menuOptionText}>
                    <Text style={[styles.menuOptionTitle, { color: colors.error }]}>Remove Client</Text>
                    <Text style={styles.menuOptionSub}>Disconnects this client from your roster</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : menuModal?.type === 'offline' ? (
              <>
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => { setMenuModal(null); Share.share({ message: `Download Coachera and search for @${profile?.username ?? 'your coach'} to connect as an online client!` }); }}
                >
                  <View style={styles.menuOptionText}>
                    <Text style={styles.menuOptionTitle}>Invite to join online</Text>
                    <Text style={styles.menuOptionSub}>Share a link so they can connect via the app</Text>
                  </View>
                </TouchableOpacity>
                {/* Link/unlink removed — auto-linking handled in background on request accept */}
                <TouchableOpacity
                  style={[styles.menuOption, styles.menuOptionDestructive]}
                  onPress={() => { setMenuModal(null); handleDeleteWalkup(menuModal.oc); }}
                >
                  <View style={styles.menuOptionText}>
                    <Text style={[styles.menuOptionTitle, { color: colors.error }]}>Remove</Text>
                    <Text style={styles.menuOptionSub}>Delete this on ground client from your list</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuModal(null)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Add Walkup Modal ── */}
      <Modal visible={showAddWalkup} transparent animationType="fade" onRequestClose={() => setShowAddWalkup(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add On Ground Client</Text>
            <Text style={styles.modalSub}>No app account needed. Just a name.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Full name *"
              placeholderTextColor={colors.textMuted}
              value={walkupName}
              onChangeText={setWalkupName}
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Phone (optional)"
              placeholderTextColor={colors.textMuted}
              value={walkupPhone}
              onChangeText={setWalkupPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddWalkup(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, (!walkupName.trim() || savingWalkup) && styles.btnDisabled]}
                onPress={handleSaveWalkup}
                disabled={!walkupName.trim() || savingWalkup}
              >
                {savingWalkup
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Program Picker for On-Ground Client ── */}
      <Modal
        visible={programPickerClient !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setProgramPickerClient(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Programs — {programPickerClient?.display_name}</Text>
            <Text style={styles.modalSub}>Tap a program to assign or remove.</Text>
            {pickerLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : myPrograms.length === 0 ? (
              <Text style={[styles.modalSub, { marginTop: spacing.md }]}>
                No programs yet. Create one in the Programs tab.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {myPrograms
                  .map((prog: Program) => {
                    const isAssigned = pickerAssignedIds.includes(prog.id);
                    const isBusy = pickerToggling === prog.id;
                    return (
                      <TouchableOpacity
                        key={prog.id}
                        style={[styles.pickerRow, isAssigned && styles.pickerRowActive]}
                        onPress={() => handlePickerToggle(prog.id)}
                        disabled={!!isBusy}
                        activeOpacity={0.8}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickerRowName}>{prog.title}</Text>
                          <Text style={styles.pickerRowSub}>{prog.duration_days} days</Text>
                        </View>
                        {isBusy ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : isAssigned ? (
                          <View style={styles.pickerAssignedBadge}>
                            <Text style={styles.pickerAssignedText}>Assigned ✓</Text>
                          </View>
                        ) : (
                          <View style={styles.pickerUnassignedBadge}>
                            <Text style={styles.pickerUnassignedText}>Assign</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.modalSaveBtn, { marginTop: spacing.md, flex: 0, alignSelf: 'stretch' }]}
              onPress={() => setProgramPickerClient(null)}
            >
              <Text style={styles.modalSaveText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Accept Client Modal ── */}
      <Modal visible={!!acceptModal} transparent animationType="fade" onRequestClose={() => setAcceptModal(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setAcceptModal(null)}>
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <Text style={styles.menuTitle}>{acceptModal?.displayName}</Text>
            <Text style={styles.menuSubtitle}>How would you like to manage this client?</Text>
            <TouchableOpacity
              style={styles.menuOption}
              onPress={async () => {
                const snap = acceptModal!;
                setAcceptModal(null);
                setAcceptingId(snap.id);
                const { error } = await acceptRequest(snap.id, 'online');
                setAcceptingId(null);
                if (error) showAlert({ title: t('common.error'), message: error });
              }}
              disabled={!!acceptingId}
              activeOpacity={0.8}
            >
              <View style={styles.menuOptionText}>
                <Text style={styles.menuOptionTitle}>Online</Text>
                <Text style={styles.menuOptionSub}>Full access to the app</Text>
              </View>
              <View style={styles.onlineBadgePill}><Text style={styles.onlineBadgeText}>Online</Text></View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuOption}
              onPress={async () => {
                const snap = acceptModal!;
                setAcceptModal(null);
                setAcceptingId(snap.id);
                const { error } = await acceptRequest(snap.id, 'offline');
                setAcceptingId(null);
                if (error) showAlert({ title: t('common.error'), message: error });
              }}
              disabled={!!acceptingId}
              activeOpacity={0.8}
            >
              <View style={styles.menuOptionText}>
                <Text style={styles.menuOptionTitle}>On Ground</Text>
                <Text style={styles.menuOptionSub}>Schedule and chat access only</Text>
              </View>
              <View style={styles.offlineBadgePill}><Text style={styles.offlineBadgeText}>On Ground</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancel} onPress={() => setAcceptModal(null)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Confirm Modal ── */}
      <Modal visible={!!confirmModal} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setConfirmModal(null)}>
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <Text style={styles.menuTitle}>{confirmModal?.title}</Text>
            {!!confirmModal?.subtitle && <Text style={styles.menuSubtitle}>{confirmModal.subtitle}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setConfirmModal(null)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, confirmModal?.destructive ? styles.modalDestructiveBtn : null]}
                onPress={() => confirmModal?.onConfirm()}
              >
                <Text style={styles.modalSaveText}>{confirmModal?.confirmText}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <AppAlert {...alertProps} />
    </>
  );
}

function ClientView() {
  const { t } = useTranslation();
  const router = useRouter();
  const { myCoach, myRequest, isLoading, fetchClientData, sendRequest, cancelRequest, disconnectFromCoach } = useConnectionStore();
  const { profile } = useAuthStore();
  const [coachUsername, setCoachUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { alertProps, showAlert } = useAppAlert();

  // Unread messages from coach
  const [coachUnread, setCoachUnread] = useState(0);

  const loadClientUnread = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('coach_client_messages')
      .select('id')
      .eq('client_id', profile.id)
      .neq('sender_id', profile.id)
      .eq('is_read', false);
    setCoachUnread((data ?? []).length);
  }, [profile?.id]);

  // Refresh data every time the tab comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchClientData();
      loadClientUnread();
    }, [])
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
    await Promise.all([fetchClientData(), loadClientUnread()]);
    setRefreshing(false);
  };

  const handleSend = async () => {
    const trimmed = coachUsername.trim().replace(/^@/, '');
    if (!trimmed) return;
    setSending(true);
    const { error } = await sendRequest(trimmed);
    setSending(false);
    if (error) showAlert({ title: t('common.error'), message: error });
    else setCoachUsername('');
  };

  const handleCancel = () => {
    const pendingCoach = myRequest?.coach;
    showAlert({
      title: t('connections.cancelRequest'),
      message: pendingCoach ? `@${pendingCoach.username}` : '',
      buttons: [
        { text: t('common.back'), style: 'cancel' },
        {
          text: t('connections.cancelRequest'), style: 'destructive',
          onPress: async () => {
            setCanceling(true);
            const { error } = await cancelRequest();
            setCanceling(false);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
  };

  const handleDisconnect = async () => {
    showAlert({
      title: t('connections.disconnect'),
      message: myCoach?.display_name ?? '',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('connections.disconnect'), style: 'destructive',
          onPress: async () => {
            setDisconnecting(true);
            const { error } = await disconnectFromCoach();
            setDisconnecting(false);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
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
          <View style={{ gap: spacing.sm }}>
            <View style={styles.coachCard}>
              <View style={{ position: 'relative' }}>
                <Avatar name={myCoach.display_name} size={52} />
                {coachUnread > 0 && (
                  <View style={styles.unreadDot}>
                    <Text style={styles.unreadDotText}>{coachUnread}</Text>
                  </View>
                )}
              </View>
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
            <TouchableOpacity
              style={styles.chatRow}
              onPress={() => router.push({
                pathname: '/chat/conversation',
                params: { coachId: myCoach.id, clientId: profile?.id, otherName: myCoach.display_name },
              })}
              activeOpacity={0.8}
            >
              <Text style={styles.chatRowText}>
                {coachUnread > 0 ? `💬 Message Coach · ${coachUnread} unread` : '💬 Message Coach'}
              </Text>
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
      <AppAlert {...alertProps} />
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

  // ── AI Assistant card ────────────────────────────────────────────────────
  aiAssistantCard: {
    backgroundColor: '#F5F3FF',
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    overflow: 'hidden',
  },
  aiAssistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  aiAssistantIcon: {
    fontSize: 22,
    color: '#7C3AED',
    fontWeight: '800',
  },
  aiAssistantTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#5B21B6',
  },
  aiAssistantSub: {
    fontSize: fontSize.xs,
    color: '#7C3AED',
    marginTop: 1,
  },
  aiAssistantChevron: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '700',
  },
  aiAssistantBody: {
    borderTopWidth: 1,
    borderTopColor: '#DDD6FE',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: '#fff',
  },
  aiAssistantInput: {
    backgroundColor: '#F5F3FF',
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  aiAssistantError: {
    fontSize: fontSize.xs,
    color: colors.error,
    fontWeight: '600',
  },
  aiAnswerBox: {
    backgroundColor: '#F5F3FF',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: spacing.md,
  },
  aiAnswerText: {
    fontSize: fontSize.sm,
    color: '#3B0764',
    lineHeight: 20,
  },
  aiAssistantBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  aiAssistantBtnDisabled: {
    opacity: 0.45,
  },
  aiAssistantBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#fff',
  },
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
  cardJoinedDate: { fontSize: 10, color: colors.textMuted, fontWeight: '400', marginTop: 1, opacity: 0.7 },
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

  // ── Offline / Walkup section ───────────────────────────────────────────────
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addWalkupBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
  },
  addWalkupBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: '#fff' },
  walkupHint: { fontSize: fontSize.xs, color: colors.success, fontWeight: '500', marginTop: -spacing.xs },
  walkupCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walkupCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  inviteRow: {
    backgroundColor: colors.primary + '12',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  inviteRowText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primary },
  walkupBadgePill: {
    backgroundColor: colors.warningFaded,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  walkupBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.warning },
  onlineBadgePill: {
    backgroundColor: colors.successFaded,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  onlineBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  offlineBadgePill: {
    backgroundColor: colors.warningFaded,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  offlineBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.warning },
  optionsBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionsBtnText: { fontSize: 16, fontWeight: '700', color: colors.textMuted, lineHeight: 22 },
  walkupTapHint: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '500' },
  linkedBadgePill: {
    backgroundColor: colors.successFaded,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  linkedBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  chatRow: {
    backgroundColor: colors.primary + '12',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '25',
  },
  chatRowText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  unreadDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  unreadDotText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // ── Add Walkup Modal ───────────────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'], backgroundColor: colors.overlay },
  modalSheet: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing['2xl'],
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  modalSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: -spacing.sm },
  modalInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  modalCancelText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  modalDestructiveBtn: { backgroundColor: colors.error },
  modalSaveText: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },

  // ── On-Ground Programs Button & Picker ────────────────────────────────────
  programsRow: {
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  programsRowText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: spacing.xs,
  },
  pickerRowActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  pickerRowName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  pickerRowSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  pickerAssignedBadge: {
    backgroundColor: colors.success + '18',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pickerAssignedText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  pickerUnassignedBadge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pickerUnassignedText: { fontSize: fontSize.xs, fontWeight: '700', color: '#fff' },

  // ── Client action sheet (··· menu) ──────────────────────────────────
  menuOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'], backgroundColor: colors.overlay },
  menuSheet: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing['2xl'],
    gap: spacing.md,
  },
  menuHandle: { display: 'none', width: 0, height: 0 },
  menuTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  menuSubtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: -spacing.xs },
  menuOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight,
  },
  menuOptionDestructive: { borderColor: `${colors.error}30`, backgroundColor: colors.errorFaded },
  menuOptionIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  menuOptionText: { flex: 1, gap: 2 },
  menuOptionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  menuOptionSub: { fontSize: fontSize.xs, color: colors.textMuted },
  menuCancel: {
    alignItems: 'center', paddingVertical: spacing.md,
    borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border,
    marginTop: spacing.xs,
  },
  menuCancelText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },

  // ── Enhanced client cards ──────────────────────────────────────────────────
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  sectionCountPill: {
    backgroundColor: colors.successFaded,
    borderRadius: borderRadius.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs + 1,
  },
  sectionCountText: { fontSize: 11, fontWeight: '800', color: colors.success },
  clientCard2: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  clientCard2Top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  // Inline program summary strip
  inlineProg: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  inlineProgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineProgDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  inlineProgName: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
  },
  inlineProgTrack: {
    width: 70,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  inlineProgFill: {
    height: 5,
    borderRadius: 3,
  },
  inlineProgPct: {
    width: 30,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right',
  },
  inlineProgEmpty: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  inlineProgEmptyText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  // Quick action bar
  quickActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surfaceLight,
  },
  quickActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    gap: 4,
  },
  quickActionBtnPrimary: {
    backgroundColor: colors.primary + '08',
  },
  quickActionDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  quickActionIcon: { fontSize: 16 },
  quickActionText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
});
