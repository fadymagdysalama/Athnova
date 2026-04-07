import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/lib/supabase';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import { useProgramStore } from '../../src/stores/programStore';
import { useDocumentStore } from '../../src/stores/documentStore';

interface SessionLog {
  id: string;
  exercise_name: string;
  sets_done: number;
  reps_done: string | null;
  weight_used: string | null;
  coach_notes: string | null;
}

interface CompletedSession {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  notes: string | null;
  logs: SessionLog[];
}

interface ClientPackage {
  id: string;
  label: string;
  total_sessions: number;
  sessions_used: number;
  notes: string | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

interface OfflineProgramProgress {
  assignmentId: string;
  programId: string;
  programTitle: string;
  currentDay: number;
  totalDays: number;
  clientVisible: boolean;
}

function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${ampm}`;
}

function thisMonthCount(sessions: CompletedSession[]) {
  const now = new Date();
  return sessions.filter((s) => {
    const d = new Date(s.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
}

export default function OfflineClientDetailScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { offlineClientId: offlineClientIdParam, clientName, linkedClientId: linkedClientIdParam, coachId, viewOnly } = useLocalSearchParams<{
    offlineClientId?: string;
    clientName?: string;
    linkedClientId?: string;
    coachId?: string;
    viewOnly?: string;
  }>();
  const isViewOnly = viewOnly === 'true';
  // When client views their own page, they are the linked client
  const linkedClientId = isViewOnly ? (profile?.id ?? undefined) : linkedClientIdParam;

  // The resolved offline_clients row id (from param or from linked_profile_id lookup)
  const [resolvedOfflineId, setResolvedOfflineId] = useState<string | null>(offlineClientIdParam ?? null);
  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Programs
  const [offlinePrograms, setOfflinePrograms] = useState<OfflineProgramProgress[]>([]);
  const { unassignProgramFromOffline, myPrograms, fetchMyPrograms, assignProgramToOffline, updateOfflineAssignmentVisibility } = useProgramStore();
  const { clientDocuments, fetchClientDocuments, previewDocument, openDocument } = useDocumentStore();

  const handleUnassignProgram = (prog: OfflineProgramProgress) => {
    if (!resolvedOfflineId) return;
    showAlert({
      title: 'Remove Program',
      message: `Remove "${prog.programTitle}" from this client?`,
      buttons: [
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await unassignProgramFromOffline(prog.programId, resolvedOfflineId);
            loadOfflinePrograms(resolvedOfflineId);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  // Program picker
  const [showProgPicker, setShowProgPicker] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [visibilityToggling, setVisibilityToggling] = useState<Record<string, boolean>>({});

  const handleAssignProgram = async (programId: string) => {
    if (!resolvedOfflineId) return;
    setAssigning(programId);
    await assignProgramToOffline(programId, resolvedOfflineId, true);
    setAssigning(null);
    setShowProgPicker(false);
    loadOfflinePrograms(resolvedOfflineId);
  };

  const handleVisibilityToggle = async (prog: OfflineProgramProgress) => {
    if (!resolvedOfflineId) return;
    setVisibilityToggling((prev) => ({ ...prev, [prog.assignmentId]: true }));
    await updateOfflineAssignmentVisibility(prog.programId, resolvedOfflineId, !prog.clientVisible);
    setVisibilityToggling((prev) => ({ ...prev, [prog.assignmentId]: false }));
    loadOfflinePrograms(resolvedOfflineId);
  };

  // Refresh programs whenever this screen is focused (e.g. returning from create)
  useFocusEffect(useCallback(() => {
    if (resolvedOfflineId) loadOfflinePrograms(resolvedOfflineId);
  }, [resolvedOfflineId]));

  // Packages
  const [packages, setPackages] = useState<ClientPackage[]>([]);
  const [showAddPkg, setShowAddPkg] = useState(false);
  const [addPkgLabel, setAddPkgLabel] = useState('');
  const [addPkgTotal, setAddPkgTotal] = useState('');

  const [savingPkg, setSavingPkg] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [showEditPkg, setShowEditPkg] = useState(false);
  const [editingPkg, setEditingPkg] = useState<ClientPackage | null>(null);
  const [editPkgLabel, setEditPkgLabel] = useState('');
  const [editPkgTotal, setEditPkgTotal] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const { alertProps, showAlert } = useAppAlert();

  const loadPackages = async (pkgOfflineId: string) => {
    const { data } = await supabase
      .from('offline_client_packages')
      .select('*')
      .eq('offline_client_id', pkgOfflineId)
      .order('created_at', { ascending: false });
    setPackages((data as ClientPackage[]) ?? []);
  };

  const loadOfflinePrograms = async (offlineId: string) => {
    const { data } = await supabase
      .from('offline_program_assignments')
      .select('id, current_day, program_id, client_visible, programs(title, duration_days)')
      .eq('offline_client_id', offlineId)
      .order('started_at', { ascending: false });
    setOfflinePrograms(
      ((data ?? []) as any[]).map((a) => ({
        assignmentId: a.id as string,
        programId: a.program_id as string,
        programTitle: (a.programs?.title ?? 'Unnamed Program') as string,
        currentDay: (a.current_day ?? 1) as number,
        totalDays: (a.programs?.duration_days ?? 0) as number,
        clientVisible: (a.client_visible ?? true) as boolean,
      }))
    );
  };

  const createPackage = async () => {
    const total = parseInt(addPkgTotal, 10);
    if (!addPkgLabel.trim() || isNaN(total) || total <= 0) return;
    if (!resolvedOfflineId) return;
    setSavingPkg(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('offline_client_packages').insert({
      offline_client_id: resolvedOfflineId,
      coach_id: user?.id,
      label: addPkgLabel.trim(),
      total_sessions: total,
      status: 'active',
    });
    setSavingPkg(false);
    setShowAddPkg(false);
    setAddPkgLabel('');
    setAddPkgTotal('');
    loadPackages(resolvedOfflineId!);
  };

  const adjustSessions = async (pkg: ClientPackage, delta: number) => {
    const newVal = Math.max(0, Math.min(pkg.total_sessions, pkg.sessions_used + delta));
    setAdjustingId(pkg.id);
    await supabase.from('offline_client_packages')
      .update({ sessions_used: newVal })
      .eq('id', pkg.id);
    setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, sessions_used: newVal } : p));
    setAdjustingId(null);
  };

  const completePackage = async (pkg: ClientPackage) => {
    await supabase.from('offline_client_packages')
      .update({ status: 'completed' })
      .eq('id', pkg.id);
    await loadPackages(resolvedOfflineId!);
    showAlert({
      title: 'Package Complete!',
      message: `"${pkg.label}" has been marked as complete. Start a new package for ${clientName}?`,
      buttons: [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Start New Package', onPress: () => setShowAddPkg(true) },
      ],
    });
  };

  const openEditPackage = (pkg: ClientPackage) => {
    setEditingPkg(pkg);
    setEditPkgLabel(pkg.label);
    setEditPkgTotal(String(pkg.total_sessions));
    setShowEditPkg(true);
  };

  const saveEditPackage = async () => {
    if (!editingPkg || !editPkgLabel.trim()) return;
    const total = parseInt(editPkgTotal, 10);
    if (isNaN(total) || total <= 0) return;
    setSavingEdit(true);
    await supabase.from('offline_client_packages')
      .update({ label: editPkgLabel.trim(), total_sessions: total })
      .eq('id', editingPkg.id);
    setSavingEdit(false);
    setShowEditPkg(false);
    setEditingPkg(null);
    loadPackages(resolvedOfflineId!);
  };

  const deletePackage = async (pkg: ClientPackage) => {
    showAlert({
      title: 'Delete Package',
      message: `Delete "${pkg.label}"? This cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('offline_client_packages').delete().eq('id', pkg.id);
            loadPackages(resolvedOfflineId!);
          },
        },
      ],
    });
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // ── Step 1: resolve the offline_clients row id ──────────────────────
      let effectiveOfflineId: string | null = offlineClientIdParam ?? null;

      if (!effectiveOfflineId && linkedClientId) {
        // App-connected on-ground client — look up by linked_profile_id
        const { data: existing } = await supabase
          .from('offline_clients')
          .select('id')
          .eq('linked_profile_id', linkedClientId)
          .maybeSingle();

        if (existing) {
          effectiveOfflineId = existing.id;
        } else if (!isViewOnly) {
          // Auto-create a minimal record so packages work (coach only)
          const { data: { user } } = await supabase.auth.getUser();
          const { data: created } = await supabase
            .from('offline_clients')
            .insert({
              coach_id: coachId ?? user?.id,
              display_name: clientName,
              linked_profile_id: linkedClientId,
            })
            .select('id')
            .single();
          if (created) effectiveOfflineId = created.id;
        }
      }

      setResolvedOfflineId(effectiveOfflineId);
      if (effectiveOfflineId) loadPackages(effectiveOfflineId);
      if (effectiveOfflineId) loadOfflinePrograms(effectiveOfflineId);
      if (effectiveOfflineId && linkedClientId) {
        fetchClientDocuments(coachId ?? profile?.id ?? '', linkedClientId);
      }

      // ── Step 2: fetch sessions ───────────────────────────────────────────
      if (linkedClientId) {
        // App client: sessions from session_clients join
        const { data: joinRows } = await supabase
          .from('session_clients')
          .select('session_id')
          .eq('client_id', linkedClientId);

        if (!joinRows || joinRows.length === 0) {
          setSessions([]);
          setLoading(false);
          return;
        }

        const sessionIds = joinRows.map((r: any) => r.session_id);

        const { data: sessionData } = await supabase
          .from('sessions')
          .select('id, date, start_time, duration_minutes, notes, status')
          .in('id', sessionIds)
          .eq('status', 'completed')
          .order('date', { ascending: false });

        const appSessionIds = (sessionData ?? []).map((s: any) => s.id);
        const { data: appLogData } = await supabase
          .from('live_session_logs')
          .select('id, session_id, exercise_name, sets_done, reps_done, weight_used, coach_notes')
          .in('session_id', appSessionIds)
          .eq('client_id', linkedClientId)
          .order('logged_at', { ascending: true });
        const appLogsBySession: Record<string, SessionLog[]> = {};
        for (const log of (appLogData ?? [])) {
          if (!appLogsBySession[log.session_id]) appLogsBySession[log.session_id] = [];
          appLogsBySession[log.session_id].push(log as SessionLog);
        }
        setSessions(
          ((sessionData ?? []) as any[]).map((s) => ({
            id: s.id,
            date: s.date,
            start_time: s.start_time,
            duration_minutes: s.duration_minutes,
            notes: s.notes,
            logs: appLogsBySession[s.id] ?? [],
          })),
        );
      } else if (effectiveOfflineId) {
        // Manual offline client: sessions from session_offline_clients
        const { data: joinRows } = await supabase
          .from('session_offline_clients')
          .select('session_id')
          .eq('offline_client_id', effectiveOfflineId);

        if (!joinRows || joinRows.length === 0) {
          setSessions([]);
          setLoading(false);
          return;
        }

        const sessionIds = joinRows.map((r: any) => r.session_id);

        const { data: sessionData } = await supabase
          .from('sessions')
          .select('id, date, start_time, duration_minutes, notes, status')
          .in('id', sessionIds)
          .eq('status', 'completed')
          .order('date', { ascending: false });

        if (!sessionData || sessionData.length === 0) {
          setSessions([]);
          setLoading(false);
          return;
        }

        const { data: logData } = await supabase
          .from('live_session_logs')
          .select('id, session_id, exercise_name, sets_done, reps_done, weight_used, coach_notes')
          .in('session_id', sessionData.map((s: any) => s.id))
          .eq('offline_client_id', effectiveOfflineId)
          .order('logged_at', { ascending: true });

        const logsBySession: Record<string, SessionLog[]> = {};
        for (const log of (logData ?? [])) {
          if (!logsBySession[log.session_id]) logsBySession[log.session_id] = [];
          logsBySession[log.session_id].push(log as SessionLog);
        }

        setSessions(
          (sessionData as any[]).map((s) => ({
            id: s.id,
            date: s.date,
            start_time: s.start_time,
            duration_minutes: s.duration_minutes,
            notes: s.notes,
            logs: logsBySession[s.id] ?? [],
          })),
        );
      }

      setLoading(false);
    };

    load();
  }, [offlineClientIdParam, linkedClientIdParam, profile?.id]);

  const total = sessions.length;
  const thisMonth = thisMonthCount(sessions);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      {isViewOnly ? (
        <View style={[styles.header, { justifyContent: 'space-between' }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.text }}>Sessions & Packages</Text>
          <View style={{ width: 40 }} />
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {coachId && linkedClientId && (
            <TouchableOpacity
              style={[styles.backBtn, { marginRight: spacing.sm }]}
              onPress={() => router.push({
                pathname: '/chat/conversation',
                params: { coachId, clientId: linkedClientId, otherName: clientName },
              })}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 18 }}>💬</Text>
            </TouchableOpacity>
          )}
          <View style={styles.groundBadge}>
            <Text style={styles.groundBadgeText}>On Ground</Text>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        {!isViewOnly && (
          <View style={styles.identityRow}>
            <Avatar name={clientName ?? '?'} size={64} />
            <View style={styles.identityText}>
              <Text style={styles.clientName}>{clientName}</Text>
              <Text style={styles.clientSub}>{linkedClientId ? 'On Ground · App Connected' : 'On Ground Client'}</Text>
            </View>
          </View>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{total}</Text>
            <Text style={styles.statLabel}>Total{'\n'}Sessions</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{thisMonth}</Text>
            <Text style={styles.statLabel}>This{'\n'}Month</Text>
          </View>

        </View>

        {/* ─── PACKAGES SECTION ─── */}
        {(() => {
          const active = packages.find(p => p.status === 'active');
          const past = packages.filter(p => p.status !== 'active');
          const pct = active ? Math.min(100, Math.round((active.sessions_used / active.total_sessions) * 100)) : 0;
          const isFull = active ? active.sessions_used >= active.total_sessions : false;
          return (
            <>
              <View style={styles.pkgSectionHeader}>
                <Text style={styles.sectionLabel}>Session Packages</Text>
                {!active && !isViewOnly && (
                  <TouchableOpacity style={styles.pkgHeaderAdd} onPress={() => setShowAddPkg(true)} activeOpacity={0.8}>
                    <Text style={styles.pkgHeaderAddText}>+ New</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!active && past.length === 0 && (
                isViewOnly ? (
                  <View style={styles.pkgEmpty}>
                    <Text style={styles.pkgEmptyTitle}>No packages yet</Text>
                    <Text style={styles.pkgEmptySub}>Your coach will assign a session package here</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.pkgEmpty} onPress={() => setShowAddPkg(true)} activeOpacity={0.85}>
                    <View style={styles.pkgEmptyIcon}>
                      <View style={{ width: 22, height: 22, borderWidth: 2.5, borderColor: colors.primary, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 18, color: colors.primary, fontWeight: '700', lineHeight: 22 }}>+</Text>
                      </View>
                    </View>
                    <Text style={styles.pkgEmptyTitle}>No package yet</Text>
                    <Text style={styles.pkgEmptySub}>Tap to create a session package for this client</Text>
                  </TouchableOpacity>
                )
              )}

              {active && (
                <View style={[styles.pkgCard, isFull && styles.pkgCardFull]}>
                  <View style={[styles.pkgAccentBar, { backgroundColor: isFull ? colors.success : colors.primary }]} />
                  <View style={styles.pkgCardInner}>
                    {/* Top row: name + status badge + coach actions */}
                    <View style={styles.pkgTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pkgLabel}>{active.label}</Text>
                      </View>
                      <View style={[styles.pkgBadge, { backgroundColor: isFull ? '#D1FAE5' : colors.accentFaded }]}>
                        <View style={[styles.pkgBadgeDot, { backgroundColor: isFull ? colors.success : colors.primary }]} />
                        <Text style={[styles.pkgBadgeText, { color: isFull ? colors.success : colors.primary }]}>
                          {isFull ? 'Full' : 'Active'}
                        </Text>
                      </View>
                      {!isViewOnly && (
                        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                          <TouchableOpacity onPress={() => openEditPackage(active)} activeOpacity={0.7} style={styles.pkgActionBtn}>
                            <Text style={styles.pkgActionBtnText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deletePackage(active)} activeOpacity={0.7} style={[styles.pkgActionBtn, { backgroundColor: colors.errorFaded }]}>
                            <Text style={[styles.pkgActionBtnText, { color: colors.error }]}>Del</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Counter display / ± row */}
                    {isViewOnly ? (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                        <Text style={styles.pkgCounterNum}>{active.sessions_used}</Text>
                        <Text style={styles.pkgCounterDen}>/ {active.total_sessions}</Text>
                        <Text style={[styles.pkgCounterLabel, { marginBottom: 3 }]}> sessions used</Text>
                      </View>
                    ) : (
                      <View style={styles.pkgCounterRow}>
                        <TouchableOpacity
                          style={[styles.pkgAdjBtn, active.sessions_used <= 0 && styles.pkgAdjBtnDis]}
                          onPress={() => adjustSessions(active, -1)}
                          disabled={active.sessions_used <= 0 || adjustingId === active.id}
                          activeOpacity={0.7}
                        >
                          {adjustingId === active.id
                            ? <ActivityIndicator size="small" color={colors.primary} />
                            : <Text style={styles.pkgAdjBtnText}>−</Text>}
                        </TouchableOpacity>

                        <View style={styles.pkgCounterCenter}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                            <Text style={styles.pkgCounterNum}>{active.sessions_used}</Text>
                            <Text style={styles.pkgCounterDen}>/ {active.total_sessions}</Text>
                          </View>
                          <Text style={styles.pkgCounterLabel}>sessions used</Text>
                        </View>

                        <TouchableOpacity
                          style={[styles.pkgAdjBtn, isFull && styles.pkgAdjBtnDis]}
                          onPress={() => adjustSessions(active, +1)}
                          disabled={isFull || adjustingId === active.id}
                          activeOpacity={0.7}
                        >
                          {adjustingId === active.id
                            ? <ActivityIndicator size="small" color={colors.primary} />
                            : <Text style={styles.pkgAdjBtnText}>+</Text>}
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Progress bar */}
                    <View style={styles.pkgBarTrack}>
                      <View
                        style={[
                          styles.pkgBarFill,
                          { width: `${pct}%` as any, backgroundColor: isFull ? colors.success : colors.primary },
                        ]}
                      />
                    </View>
                    <Text style={styles.pkgBarLabel}>{pct}% complete</Text>

                    <Text style={styles.pkgStarted}>
                      Started {new Date(active.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>

                    {isFull && !isViewOnly && (
                      <TouchableOpacity style={styles.pkgCompleteBtn} onPress={() => completePackage(active)} activeOpacity={0.85}>
                        <Text style={styles.pkgCompleteBtnText}>Mark as Complete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {past.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 4 }]}>Past Packages</Text>
                  {past.map(pkg => {
                    const p = Math.min(100, Math.round((pkg.sessions_used / pkg.total_sessions) * 100));
                    const done = pkg.status === 'completed';
                    return (
                      <View key={pkg.id} style={styles.pkgPastCard}>
                        <View style={[styles.pkgPastAccent, { backgroundColor: done ? colors.success : colors.textMuted }]} />
                        <View style={{ flex: 1, gap: 6, padding: spacing.md }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={styles.pkgPastLabel}>{pkg.label}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                              {!isViewOnly && (
                                <>
                                  <TouchableOpacity onPress={() => openEditPackage(pkg)} activeOpacity={0.7}>
                                    <Text style={[styles.pkgPastStatus, { color: colors.primary }]}>Edit</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => deletePackage(pkg)} activeOpacity={0.7}>
                                    <Text style={[styles.pkgPastStatus, { color: colors.error }]}>Del</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                              <Text style={[styles.pkgPastStatus, { color: done ? colors.success : colors.textMuted }]}>
                                {done ? 'Completed' : 'Cancelled'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.pkgPastMeta}>{pkg.sessions_used} / {pkg.total_sessions} sessions · {p}%</Text>
                          <View style={styles.pkgPastBarTrack}>
                            <View style={[styles.pkgPastBarFill, { width: `${p}%` as any, backgroundColor: done ? colors.success : colors.textMuted }]} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  {!packages.find(p => p.status === 'active') && !isViewOnly && (
                    <TouchableOpacity style={styles.pkgHeaderAdd} onPress={() => setShowAddPkg(true)} activeOpacity={0.8}>
                      <Text style={styles.pkgHeaderAddText}>+ Start New Package</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* Session history */}
        <>
          <Text style={styles.sectionLabel}>Programs</Text>
          {offlinePrograms.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconBox}>
                <Text style={{ fontSize: 28 }}>🏋️</Text>
              </View>
              <Text style={styles.emptyTitle}>No programs assigned</Text>
              <Text style={styles.emptySub}>Assign an existing program or build one from scratch for this client.</Text>
              {!isViewOnly && (
                <View style={styles.emptyProgActions}>
                  <TouchableOpacity
                    style={styles.emptyProgBtnOutline}
                    onPress={() => { fetchMyPrograms(); setShowProgPicker(true); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.emptyProgBtnOutlineText}>📋  Assign Program</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.emptyProgBtnFill}
                    onPress={() => router.push({ pathname: '/programs/create', params: { offlineClientPreselect: resolvedOfflineId ?? undefined, clientName: clientName } })}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.emptyProgBtnFillText}>⚡  Build Program</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <>
            {offlinePrograms.map((prog) => {
              const pct = prog.totalDays > 0
                ? Math.min(100, Math.round(((prog.currentDay - 1) / prog.totalDays) * 100))
                : 0;
              const week = Math.ceil(prog.currentDay / 7);
              const dayOfWeek = ((prog.currentDay - 1) % 7) + 1;
              return (
                <TouchableOpacity key={prog.assignmentId} style={styles.progCard} onPress={() => router.push({ pathname: '/programs/detail', params: { id: prog.programId } })} activeOpacity={0.85}>
                  <View style={styles.progAccentBar} />
                  <View style={styles.progCardInner}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={[styles.progCardTitle, { flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>{prog.programTitle}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {!isViewOnly && linkedClientId && (
                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={(e) => { e.stopPropagation(); handleVisibilityToggle(prog); }}
                            activeOpacity={0.7}
                            disabled={!!visibilityToggling[prog.assignmentId]}
                          >
                            {visibilityToggling[prog.assignmentId]
                              ? <ActivityIndicator size="small" color={colors.primary} />
                              : <View style={[styles.visibilityBadge, prog.clientVisible ? styles.visibilityBadgeOn : styles.visibilityBadgeOff]}>
                                  <Text style={[styles.visibilityBadgeText, prog.clientVisible ? styles.visibilityBadgeTextOn : styles.visibilityBadgeTextOff]}>
                                    {prog.clientVisible ? '👁 Visible' : '🔒 Hidden'}
                                  </Text>
                                </View>}
                          </TouchableOpacity>
                        )}
                        {!isViewOnly && (
                          <TouchableOpacity
                            style={styles.progMenuBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={(e) => { e.stopPropagation(); handleUnassignProgram(prog); }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.progMenuBtnText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <Text style={styles.progCardMeta}>
                      Week {week} · Day {dayOfWeek}
                      {prog.totalDays > 0 ? `  ·  ${prog.currentDay - 1} / ${prog.totalDays} days done` : ''}
                    </Text>
                    {prog.totalDays > 0 && (
                      <>
                        <View style={styles.progBarTrack}>
                          <View style={[styles.progBarFill, { width: `${pct}%` as any }]} />
                        </View>
                        <Text style={styles.progBarLabel}>{pct}% complete</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            {!isViewOnly && (
              <TouchableOpacity
                style={styles.addProgRowBtn}
                onPress={() => { fetchMyPrograms(); setShowProgPicker(true); }}
                activeOpacity={0.8}
              >
                <Text style={styles.addProgRowBtnText}>+ Add Program</Text>
              </TouchableOpacity>
            )}
            </>
          )}
        </>

        {/* Documents section — only when client has the app */}
        {linkedClientId && !isViewOnly && (
          <>
            <Text style={styles.sectionLabel}>Documents</Text>
            {clientDocuments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptySub}>No documents shared with this client yet.</Text>
                <TouchableOpacity
                  style={[styles.emptyProgBtnFill, { marginTop: spacing.md, alignSelf: 'center' }]}
                  onPress={() => router.push('/(tabs)/programs')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyProgBtnFillText}>📤  Manage Documents</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {clientDocuments.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={styles.docCard}
                    activeOpacity={0.8}
                    onPress={() => previewDocument(doc)}
                  >
                    <View style={styles.docIconBox}>
                      <Text style={{ fontSize: 20 }}>📄</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docCardTitle} numberOfLines={1}>{doc.title}</Text>
                      {!!doc.description && (
                        <Text style={styles.docCardDesc} numberOfLines={2}>{doc.description}</Text>
                      )}
                      <Text style={styles.docCardMeta}>Tap to preview</Text>
                    </View>
                    <TouchableOpacity
                      hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
                      onPress={() => openDocument(doc, doc.coach_id)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 20 }}>⬆️</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* Program picker modal */}
        <Modal
          visible={showProgPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowProgPicker(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowProgPicker(false)}>
            <View style={styles.pickerOverlay}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.pickerSheet}>
                  <View style={styles.pickerHandle} />
                  <Text style={styles.pickerTitle}>Assign a Program</Text>
                  {myPrograms.length === 0 ? (
                    <Text style={styles.pickerEmpty}>No programs yet. Build one first.</Text>
                  ) : (
                    myPrograms.map((prog) => (
                      <TouchableOpacity
                        key={prog.id}
                        style={styles.pickerRow}
                        onPress={() => handleAssignProgram(prog.id)}
                        activeOpacity={0.8}
                        disabled={!!assigning}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickerRowTitle}>{prog.title}</Text>
                        </View>
                        {assigning === prog.id
                          ? <ActivityIndicator size="small" color={colors.primary} />
                          : <Text style={styles.pickerRowArrow}>›</Text>}
                      </TouchableOpacity>
                    ))
                  )}
                  <TouchableOpacity
                    style={styles.pickerBuildBtn}
                    onPress={() => {
                      setShowProgPicker(false);
                      router.push({ pathname: '/programs/create', params: { offlineClientPreselect: resolvedOfflineId ?? undefined, clientName: clientName } });
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pickerBuildBtnText}>⚡  Build New Program</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Session history */}
        <Text style={styles.sectionLabel}>Session History</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBox}>
              {/* Calendar icon */}
              <View style={{ width: 28, height: 28, borderWidth: 2, borderColor: colors.textMuted, borderRadius: 5, alignItems: 'center' }}>
                <View style={{ width: 18, height: 2, backgroundColor: colors.textMuted, marginTop: 7 }} />
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                  <View style={{ width: 5, height: 5, backgroundColor: colors.textMuted, borderRadius: 1, opacity: 0.5 }} />
                  <View style={{ width: 5, height: 5, backgroundColor: colors.textMuted, borderRadius: 1, opacity: 0.5 }} />
                </View>
              </View>
            </View>
            <Text style={styles.emptyTitle}>No completed sessions yet</Text>
            <Text style={styles.emptySub}>
              Sessions this client attends will appear here once completed.
            </Text>
          </View>
        ) : (
          sessions.map((session) => {
            const isExpanded = expandedId === session.id;
            const exerciseCount = session.logs.filter(l => l.exercise_name !== 'Coach Note').length;
            return (
              <TouchableOpacity
                key={session.id}
                style={[styles.sessionCard, isExpanded && styles.sessionCardExpanded]}
                onPress={() => setExpandedId(isExpanded ? null : session.id)}
                activeOpacity={0.85}
              >
                {/* Session header row */}
                <View style={styles.sessionTop}>
                  <View style={styles.sessionDateBox}>
                    <Text style={styles.sessionDay}>
                      {new Date(session.date).toLocaleDateString('en-US', { day: 'numeric' })}
                    </Text>
                    <Text style={styles.sessionMonth}>
                      {new Date(session.date).toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionTitle}>{formatDate(session.date)}</Text>
                    <Text style={styles.sessionMeta}>
                      {formatTime(session.start_time)} · {session.duration_minutes} min
                      {exerciseCount > 0 ? `  ·  ${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''} logged` : ''}
                    </Text>
                  </View>
                  <View style={styles.chevronBox}>
                    <Text style={[styles.chevron, isExpanded && styles.chevronOpen]}>›</Text>
                  </View>
                </View>

                {/* Expanded exercise log */}
                {isExpanded && (() => {
                  const noteLog = session.logs.find(l => l.exercise_name === 'Coach Note');
                  const noteText = session.notes || noteLog?.coach_notes;
                  const exerciseLogs = session.logs.filter(l => l.exercise_name !== 'Coach Note');
                  return (
                    <View style={styles.logsSection}>
                      {noteText ? (
                        <View style={styles.sessionNoteBox}>
                          <Text style={styles.sessionNoteLabel}>Session note</Text>
                          <Text style={styles.sessionNote}>{noteText}</Text>
                        </View>
                      ) : null}

                      {!noteText && exerciseLogs.length === 0 && (
                        <Text style={styles.noLogsText}>No session notes recorded.</Text>
                      )}

                      {exerciseLogs.length > 0 && (
                        <>
                          <Text style={styles.logsTitle}>Exercises Logged</Text>
                          {exerciseLogs.map((log) => (
                            <View key={log.id} style={styles.logRow}>
                              <View style={styles.logAccent} />
                              <View style={styles.logBody}>
                                <Text style={styles.logName}>{log.exercise_name}</Text>
                                <View style={styles.logChips}>
                                  {log.sets_done > 0 && (
                                    <View style={styles.logChip}>
                                      <Text style={styles.logChipText}>{log.sets_done} sets</Text>
                                    </View>
                                  )}
                                  {log.reps_done ? (
                                    <View style={styles.logChip}>
                                      <Text style={styles.logChipText}>{log.reps_done} reps</Text>
                                    </View>
                                  ) : null}
                                  {log.weight_used ? (
                                    <View style={styles.logChip}>
                                      <Text style={styles.logChipText}>{log.weight_used}</Text>
                                    </View>
                                  ) : null}
                                </View>
                                {log.coach_notes ? (
                                  <Text style={styles.logNote}>"{log.coach_notes}"</Text>
                                ) : null}
                              </View>
                            </View>
                          ))}
                        </>
                      )}
                    </View>
                  );
                })()}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      {/* ─── ADD PACKAGE MODAL ─── */}
      <Modal visible={showAddPkg} transparent animationType="fade" onRequestClose={() => setShowAddPkg(false)}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowAddPkg(false); }}>
          <View style={styles.pkgModalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.pkgModalSheet}>
                  <Text style={styles.pkgModalTitle}>New Session Package</Text>
                  <Text style={styles.pkgModalSub}>Set the number of sessions in this bundle for {clientName}.</Text>

                  <Text style={styles.pkgInputLabel}>Package Name</Text>
                  <TextInput
                    style={styles.pkgInput}
                    value={addPkgLabel}
                    onChangeText={setAddPkgLabel}
                    placeholder="e.g. Monthly 12-Pack"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="next"
                  />

                  <Text style={styles.pkgInputLabel}>Total Sessions</Text>
                  <TextInput
                    style={styles.pkgInput}
                    value={addPkgTotal}
                    onChangeText={setAddPkgTotal}
                    placeholder="e.g. 12"
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textMuted}
                  />

                  <TouchableOpacity
                    style={[
                      styles.pkgModalSave,
                      (savingPkg || !addPkgLabel.trim() || !addPkgTotal.trim()) && { opacity: 0.45 },
                    ]}
                    onPress={createPackage}
                    disabled={savingPkg || !addPkgLabel.trim() || !addPkgTotal.trim()}
                    activeOpacity={0.85}
                  >
                    {savingPkg
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.pkgModalSaveText}>Create Package</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.pkgModalCancel} onPress={() => setShowAddPkg(false)} activeOpacity={0.7}>
                    <Text style={styles.pkgModalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* ─── EDIT PACKAGE MODAL ─── */}
      <Modal visible={showEditPkg} transparent animationType="fade" onRequestClose={() => setShowEditPkg(false)}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowEditPkg(false); }}>
          <View style={styles.pkgModalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.pkgModalSheet}>
                  <Text style={styles.pkgModalTitle}>Edit Package</Text>

                  <Text style={styles.pkgInputLabel}>Package Name</Text>
                  <TextInput
                    style={styles.pkgInput}
                    value={editPkgLabel}
                    onChangeText={setEditPkgLabel}
                    placeholder="e.g. Monthly 12-Pack"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="next"
                  />

                  <Text style={styles.pkgInputLabel}>Total Sessions</Text>
                  <TextInput
                    style={styles.pkgInput}
                    value={editPkgTotal}
                    onChangeText={setEditPkgTotal}
                    placeholder="e.g. 12"
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textMuted}
                  />

                  <TouchableOpacity
                    style={[
                      styles.pkgModalSave,
                      (savingEdit || !editPkgLabel.trim() || !editPkgTotal.trim()) && { opacity: 0.45 },
                    ]}
                    onPress={saveEditPackage}
                    disabled={savingEdit || !editPkgLabel.trim() || !editPkgTotal.trim()}
                    activeOpacity={0.85}
                  >
                    {savingEdit
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.pkgModalSaveText}>Save Changes</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.pkgModalCancel} onPress={() => setShowEditPkg(false)} activeOpacity={0.7}>
                    <Text style={styles.pkgModalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <AppAlert {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accentFaded,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 28, color: colors.primary, fontWeight: '600', lineHeight: 32, marginLeft: -2 },
  groundBadge: {
    backgroundColor: colors.warningFaded,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  groundBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.warning },

  // Identity
  content: { paddingHorizontal: spacing['2xl'], paddingBottom: 60, gap: spacing.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  identityText: { flex: 1, gap: 4 },
  clientName: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text },
  clientSub: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  statValue: { fontSize: 28, fontWeight: '800', color: colors.primary, lineHeight: 32 },
  statLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textAlign: 'center', lineHeight: 14 },

  // Section
  sectionLabel: {
    fontSize: fontSize.sm, fontWeight: '700',
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Program progress cards
  progCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progAccentBar: {
    width: 4,
    backgroundColor: colors.primary,
  },
  progCardInner: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  progCardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  progCardMeta: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  progBarTrack: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progBarFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progBarLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  // Empty state
  emptyCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', paddingVertical: spacing['3xl'], paddingHorizontal: spacing['2xl'], gap: spacing.md,
  },
  emptyIconBox: { width: 60, height: 60, borderRadius: 16, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  assignProgBtn: {
    marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
  },
  assignProgBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  // Empty programs action buttons
  emptyProgActions: {
    flexDirection: 'row', gap: spacing.sm, width: '100%', marginTop: spacing.xs,
  },
  emptyProgBtnOutline: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyProgBtnOutlineText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  emptyProgBtnFill: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyProgBtnFillText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  // Program card remove button
  progMenuBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  progMenuBtnText: { fontSize: 11, fontWeight: '800', color: '#EF4444', lineHeight: 14 },

  addProgRowBtn: {
    marginTop: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  addProgRowBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  visibilityBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  visibilityBadgeOn: { backgroundColor: `${colors.success}22` },
  visibilityBadgeOff: { backgroundColor: `${colors.textMuted}22` },
  visibilityBadgeText: { fontSize: 11, fontWeight: '700' },
  visibilityBadgeTextOn: { color: colors.success },
  visibilityBadgeTextOff: { color: colors.textMuted },

  docCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  docIconBox: {
    width: 40, height: 40, borderRadius: borderRadius.sm,
    backgroundColor: colors.accentFaded,
    alignItems: 'center', justifyContent: 'center',
  },
  docCardTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  docCardDesc: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  docCardMeta: { fontSize: fontSize.xs, color: colors.primary, marginTop: 2, fontWeight: '600' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: spacing.sm, paddingBottom: spacing['3xl'], paddingHorizontal: spacing.xl,
    maxHeight: '70%',
  },
  pickerHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg,
  },
  pickerTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  pickerEmpty: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  pickerRowTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  pickerRowArrow: { fontSize: 20, color: colors.textMuted },
  pickerBuildBtn: {
    marginTop: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  pickerBuildBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  // Session cards
  sessionCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  sessionCardExpanded: { borderColor: colors.primary },
  sessionTop: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  sessionDateBox: {
    width: 44, height: 50, borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  sessionDay: { fontSize: fontSize.lg, fontWeight: '800', color: '#fff', lineHeight: 22 },
  sessionMonth: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' },
  sessionInfo: { flex: 1, gap: 2 },
  sessionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  sessionMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  chevronBox: { width: 24, alignItems: 'center' },
  chevron: { fontSize: 22, color: colors.textMuted, fontWeight: '300' },
  chevronOpen: { transform: [{ rotate: '90deg' }] },

  // Expanded logs
  logsSection: {
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    padding: spacing.md, gap: spacing.sm,
    backgroundColor: colors.background,
  },
  sessionNoteBox: {
    backgroundColor: colors.accentFaded, borderRadius: borderRadius.sm,
    padding: spacing.sm, gap: 2,
  },
  sessionNoteLabel: { fontSize: 10, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  sessionNote: { fontSize: fontSize.xs, color: colors.text },
  logsTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  logRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  logAccent: { width: 3, borderRadius: 2, backgroundColor: colors.primary, alignSelf: 'stretch', minHeight: 36 },
  logBody: { flex: 1, gap: 4 },
  logName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  logChips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  logChip: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  logChipText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  logNote: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  noLogsText: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // ── Packages ──────────────────────────────────────────────
  pkgSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pkgHeaderAdd: {
    backgroundColor: colors.accentFaded, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md, paddingVertical: 4,
  },
  pkgHeaderAddText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },

  pkgEmpty: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', paddingVertical: spacing['3xl'], gap: spacing.sm,
  },
  pkgEmptyIcon: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: colors.accentFaded, alignItems: 'center', justifyContent: 'center',
  },
  pkgEmptyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  pkgEmptySub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },

  pkgCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', overflow: 'hidden',
  },
  pkgCardFull: { borderColor: colors.success },
  pkgAccentBar: { width: 5 },
  pkgCardInner: { flex: 1, padding: spacing.md, gap: spacing.sm },

  pkgTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  pkgLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  pkgPrice: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  pkgActionBtn: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.surfaceLight,
  },
  pkgActionBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  pkgBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  pkgBadgeDot: { width: 7, height: 7, borderRadius: 4 },
  pkgBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  pkgCounterRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginVertical: spacing.xs,
  },
  pkgAdjBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: colors.accentFaded,
    alignItems: 'center', justifyContent: 'center',
  },
  pkgAdjBtnDis: { opacity: 0.35 },
  pkgAdjBtnText: { fontSize: 22, fontWeight: '600', color: colors.primary, lineHeight: 26 },
  pkgCounterCenter: { alignItems: 'center', gap: 2 },
  pkgCounterNum: { fontSize: 40, fontWeight: '900', color: colors.primary, lineHeight: 44 },
  pkgCounterDen: { fontSize: 18, fontWeight: '600', color: colors.textMuted, lineHeight: 28, marginBottom: 2 },
  pkgCounterLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  pkgBarTrack: {
    height: 8, backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full, overflow: 'hidden',
  },
  pkgBarFill: { height: '100%', borderRadius: borderRadius.full },
  pkgBarLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600', textAlign: 'right' },
  pkgStarted: { fontSize: fontSize.xs, color: colors.textMuted },

  pkgCompleteBtn: {
    backgroundColor: colors.success, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.xs,
  },
  pkgCompleteBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  pkgPastCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', overflow: 'hidden', padding: 0,
  },
  pkgPastAccent: { width: 4 },
  pkgPastLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, flex: 1 },
  pkgPastStatus: { fontSize: fontSize.xs, fontWeight: '600' },
  pkgPastMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  pkgPastCard2Inner: { flex: 1, gap: 6, padding: spacing.md },
  pkgPastBarTrack: { height: 5, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.full, overflow: 'hidden' },
  pkgPastBarFill: { height: '100%', borderRadius: borderRadius.full },

  // Modal
  pkgModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
  },
  pkgModalSheet: {
    backgroundColor: colors.card,
    borderRadius: 20,
    marginHorizontal: spacing.xl,
    padding: spacing['2xl'], gap: spacing.sm,
  },
  pkgModalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  pkgModalSub: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.sm },
  pkgInputLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xs },
  pkgInput: {
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.md, color: colors.text,
  },
  pkgModalSave: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md,
  },
  pkgModalSaveText: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },
  pkgModalCancel: { alignItems: 'center', paddingVertical: spacing.sm },
  pkgModalCancelText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
});
