import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useOfflineClientStore } from '../../src/stores/offlineClientStore';
import { useProgramStore } from '../../src/stores/programStore';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { OfflineClient, Profile } from '../../src/types';

type Filter = 'all' | 'online' | 'onground';

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
  const { id: programId, clientPreselect, offlineClientPreselect } = useLocalSearchParams<{ id: string; clientPreselect?: string; offlineClientPreselect?: string }>();
  const { clients, fetchCoachData } = useConnectionStore();
  const { offlineClients, fetchOfflineClients } = useOfflineClientStore();
  const {
    myPrograms,
    fetchMyPrograms,
    assignProgram,
    unassignProgram,
    fetchProgramAssignments,
    updateAssignmentVisibility,
    assignProgramToOffline,
    unassignProgramFromOffline,
    fetchOfflineProgramAssignments,
    updateOfflineAssignmentVisibility,
  } = useProgramStore();

  const [assignedOnlineMap, setAssignedOnlineMap] = useState<Record<string, boolean>>({});
  const [assignedOfflineMap, setAssignedOfflineMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  type ActionModal =
    | { mode: 'assign'; clientId: string; name: string; isOffline: boolean }
    | { mode: 'manage'; clientId: string; name: string; isOffline: boolean; currentlyVisible: boolean };
  const [actionModal, setActionModal] = useState<ActionModal | null>(null);
  const { alertProps, showAlert } = useAppAlert();

  // When navigated from "Build Program" on a client card, auto-open assign modal
  // for that specific client as soon as data has loaded.
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (loading || autoTriggeredRef.current) return;
    if (clientPreselect) {
      const found = clients.find((c: any) => c.profile.id === clientPreselect);
      if (found) {
        autoTriggeredRef.current = true;
        setActionModal({ mode: 'assign', clientId: clientPreselect, name: found.profile.display_name, isOffline: false });
      }
    } else if (offlineClientPreselect) {
      const found = offlineClients.find((oc: OfflineClient) => oc.id === offlineClientPreselect);
      if (found) {
        autoTriggeredRef.current = true;
        setActionModal({ mode: 'assign', clientId: offlineClientPreselect, name: found.display_name, isOffline: true });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, clients, offlineClients]);

  const program = myPrograms.find((p) => p.id === programId);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchMyPrograms(), fetchCoachData(), fetchOfflineClients()]);
      if (programId) {
        const [onlineDetails, offlineDetails] = await Promise.all([
          fetchProgramAssignments(programId),
          fetchOfflineProgramAssignments(programId),
        ]);
        const om: Record<string, boolean> = {};
        onlineDetails.forEach((d) => { om[d.clientId] = d.clientVisible; });
        setAssignedOnlineMap(om);
        const offm: Record<string, boolean> = {};
        offlineDetails.forEach((d) => { offm[d.clientId] = d.clientVisible; });
        setAssignedOfflineMap(offm);
      }
      setLoading(false);
    };
    init();
  }, [programId]);

  const handleToggle = (clientId: string, name: string, isOffline: boolean) => {
    if (!programId) return;
    const map = isOffline ? assignedOfflineMap : assignedOnlineMap;
    const isAssigned = clientId in map;
    if (!isAssigned) {
      setActionModal({ mode: 'assign', clientId, name, isOffline });
    } else {
      setActionModal({ mode: 'manage', clientId, name, isOffline, currentlyVisible: map[clientId] });
    }
  };

  const doAssign = async (clientId: string, isOffline: boolean, clientVisible: boolean) => {
    if (!programId) return;
    // If the program itself is private, never expose it to clients regardless of what was chosen
    const effectiveVisible = clientVisible && !program?.is_coach_only;
    setToggling(clientId);
    if (isOffline) {
      const { error } = await assignProgramToOffline(programId, clientId, effectiveVisible);
      if (error) showAlert({ title: t('common.error'), message: error });
      else setAssignedOfflineMap((m) => ({ ...m, [clientId]: effectiveVisible }));
    } else {
      const { error } = await assignProgram(programId, clientId, effectiveVisible);
      if (error) showAlert({ title: t('common.error'), message: error });
      else setAssignedOnlineMap((m) => ({ ...m, [clientId]: effectiveVisible }));
    }
    setToggling(null);
  };

  const doUnassign = async (clientId: string, isOffline: boolean) => {
    if (!programId) return;
    setToggling(clientId);
    if (isOffline) {
      const { error } = await unassignProgramFromOffline(programId, clientId);
      if (error) showAlert({ title: t('common.error'), message: error });
      else setAssignedOfflineMap((m) => { const n = { ...m }; delete n[clientId]; return n; });
    } else {
      const { error } = await unassignProgram(programId, clientId);
      if (error) showAlert({ title: t('common.error'), message: error });
      else setAssignedOnlineMap((m) => { const n = { ...m }; delete n[clientId]; return n; });
    }
    setToggling(null);
  };

  const doUpdateVisibility = async (clientId: string, isOffline: boolean, clientVisible: boolean) => {
    if (!programId) return;
    setToggling(clientId);
    if (isOffline) {
      const { error } = await updateOfflineAssignmentVisibility(programId, clientId, clientVisible);
      if (error) showAlert({ title: t('common.error'), message: error });
      else setAssignedOfflineMap((m) => ({ ...m, [clientId]: clientVisible }));
    } else {
      const { error } = await updateAssignmentVisibility(programId, clientId, clientVisible);
      if (error) showAlert({ title: t('common.error'), message: error });
      else setAssignedOnlineMap((m) => ({ ...m, [clientId]: clientVisible }));
    }
    setToggling(null);
  };

  const renderRow = (id: string, name: string, sub: string, typeBadge: string, isOffline: boolean) => {
    const map = isOffline ? assignedOfflineMap : assignedOnlineMap;
    const isAssigned = id in map;
    const clientVisible = map[id];
    const isBusy = toggling === id;
    return (
      <TouchableOpacity
        key={id}
        style={[styles.clientRow, isAssigned && styles.clientRowActive]}
        onPress={() => handleToggle(id, name, isOffline)}
        activeOpacity={0.8}
        disabled={isBusy}
      >
        <Avatar name={name} />
        <View style={styles.clientInfo}>
          <Text style={styles.clientName}>{name}</Text>
          <Text style={styles.clientUsername}>{sub}</Text>
        </View>
        <View style={[styles.typePill, isOffline ? styles.typePillGround : styles.typePillOnline]}>
          <Text style={[styles.typePillText, isOffline ? styles.typePillGroundText : styles.typePillOnlineText]}>
            {typeBadge}
          </Text>
        </View>
        {isBusy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : isAssigned ? (
          <View style={styles.assignedBlock}>
            <View style={styles.assignedBadge}>
              <Text style={styles.assignedBadgeText}>{t('programs.assigned')}</Text>
            </View>
            <View style={[styles.visibilityPill, clientVisible ? styles.visibilityPillVisible : styles.visibilityPillPrivate]}>
              <Text style={[styles.visibilityPillText, clientVisible ? styles.visibilityPillVisibleText : styles.visibilityPillPrivateText]}>
                {clientVisible ? '👁 Visible' : '🔒 Private'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.unassignedBadge}>
            <Text style={styles.unassignedBadgeText}>{t('programs.assignToClient')}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const noClients = clients.length === 0 && offlineClients.length === 0;
  const showOnline = filter === 'all' || filter === 'online';
  const showGround = filter === 'all' || filter === 'onground';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{program?.title ?? t('programs.assignProgram')}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {(['all', 'online', 'onground'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, filter === f && styles.filterPillActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
              {f === 'all' ? `All (${clients.length + offlineClients.length})` : f === 'online' ? `Online (${clients.length})` : `On Ground (${offlineClients.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : noClients ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('connections.noClients')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>{t('programs.selectClient')}</Text>
          {showOnline && clients.map(({ profile }: { profile: Profile }) =>
            renderRow(profile.id, profile.display_name, `@${profile.username}`, 'Online', false),
          )}
          {showGround && offlineClients.map((oc: OfflineClient) =>
            renderRow(oc.id, oc.display_name, oc.phone ?? 'On ground client', 'On Ground', true),
          )}
          {showOnline && clients.length === 0 && filter === 'online' && (
            <Text style={styles.sectionEmpty}>No online clients yet.</Text>
          )}
          {showGround && offlineClients.length === 0 && filter === 'onground' && (
            <Text style={styles.sectionEmpty}>No on ground clients yet.</Text>
          )}
        </ScrollView>
      )}

      {/* ── Visibility / Manage action modal ─────────────────────────────── */}
      <Modal
        visible={!!actionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActionModal(null)}>
          <Pressable style={styles.actionSheet} onPress={() => {}}>
            {actionModal?.mode === 'assign' ? (
              <>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Assign Program</Text>
                <Text style={styles.sheetSub}>How should <Text style={{ fontWeight: '700', color: colors.text }}>{actionModal.name}</Text> see this program?</Text>
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => { setActionModal(null); doAssign(actionModal.clientId, actionModal.isOffline, true); }}
                >
                  <View style={[styles.sheetOptionIcon, { backgroundColor: colors.successFaded }]}>
                    <Text style={{ fontSize: 18 }}>👁</Text>
                  </View>
                  <View style={styles.sheetOptionText}>
                    <Text style={styles.sheetOptionTitle}>Visible to client</Text>
                    <Text style={styles.sheetOptionSub}>Client can track this program in the app</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => { setActionModal(null); doAssign(actionModal.clientId, actionModal.isOffline, false); }}
                >
                  <View style={[styles.sheetOptionIcon, { backgroundColor: colors.warningFaded }]}>
                    <Text style={{ fontSize: 18 }}>🔒</Text>
                  </View>
                  <View style={styles.sheetOptionText}>
                    <Text style={styles.sheetOptionTitle}>Coach reference only</Text>
                    <Text style={styles.sheetOptionSub}>Hidden from client — for your eyes only</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetCancel} onPress={() => setActionModal(null)}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : actionModal?.mode === 'manage' ? (
              <>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>{actionModal.name}</Text>
                <Text style={styles.sheetSub}>
                  {actionModal.currentlyVisible ? '👁 Client can currently see this program' : '🔒 Currently coach reference only (hidden from client)'}
                </Text>
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => { setActionModal(null); doUpdateVisibility(actionModal.clientId, actionModal.isOffline, !actionModal.currentlyVisible); }}
                >
                  <View style={[styles.sheetOptionIcon, { backgroundColor: actionModal.currentlyVisible ? colors.warningFaded : colors.successFaded }]}>
                    <Text style={{ fontSize: 18 }}>{actionModal.currentlyVisible ? '🙈' : '👁'}</Text>
                  </View>
                  <View style={styles.sheetOptionText}>
                    <Text style={styles.sheetOptionTitle}>
                      {actionModal.currentlyVisible ? 'Hide from client' : 'Make visible to client'}
                    </Text>
                    <Text style={styles.sheetOptionSub}>
                      {actionModal.currentlyVisible ? 'Program moves to coach-only view' : 'Client can track this program in their app'}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetOption, styles.sheetOptionDestructive]}
                  onPress={() => { setActionModal(null); doUnassign(actionModal.clientId, actionModal.isOffline); }}
                >
                  <View style={[styles.sheetOptionIcon, { backgroundColor: colors.errorFaded }]}>
                    <Text style={{ fontSize: 18 }}>🗑</Text>
                  </View>
                  <View style={styles.sheetOptionText}>
                    <Text style={[styles.sheetOptionTitle, { color: colors.error }]}>Unassign</Text>
                    <Text style={styles.sheetOptionSub}>Remove this program from the client</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetCancel} onPress={() => setActionModal(null)}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      <AppAlert {...alertProps} />
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
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'center', marginHorizontal: spacing.sm },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  filterPill: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterPillText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  filterPillTextActive: { color: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing['2xl'] },
  content: { padding: spacing['2xl'], gap: spacing.sm, paddingBottom: 60 },
  hint: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs,
  },
  sectionEmpty: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  clientRow: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.md, flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  clientRowActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}08` },
  avatar: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.textInverse, fontWeight: '700' },
  clientInfo: { flex: 1, gap: 2 },
  clientName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  clientUsername: { fontSize: fontSize.xs, color: colors.textMuted },
  typePill: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  typePillOnline: { backgroundColor: colors.successFaded },
  typePillGround: { backgroundColor: colors.warningFaded },
  typePillText: { fontSize: 10, fontWeight: '700' },
  typePillOnlineText: { color: colors.success },
  typePillGroundText: { color: colors.warning },
  assignedBlock: { alignItems: 'flex-end', gap: 4 },
  assignedBadge: {
    backgroundColor: `${colors.success}18`, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  assignedBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  visibilityPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  visibilityPillVisible: { backgroundColor: `${colors.primary}12` },
  visibilityPillPrivate: { backgroundColor: `${colors.warning}18` },
  visibilityPillText: { fontSize: 10, fontWeight: '600' },
  visibilityPillVisibleText: { color: colors.primary },
  visibilityPillPrivateText: { color: colors.warning },
  unassignedBadge: {
    backgroundColor: colors.primary, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  unassignedBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textInverse },

  // ── Action sheet modal ────────────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  actionSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing['2xl'],
    paddingBottom: 40,
    gap: spacing.md,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.xs,
  },
  sheetTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: -spacing.xs },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight,
  },
  sheetOptionDestructive: { borderColor: `${colors.error}30`, backgroundColor: colors.errorFaded },
  sheetOptionIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetOptionText: { flex: 1, gap: 2 },
  sheetOptionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  sheetOptionSub: { fontSize: fontSize.xs, color: colors.textMuted },
  sheetCancel: {
    alignItems: 'center', paddingVertical: spacing.md,
    borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border,
    marginTop: spacing.xs,
  },
  sheetCancelText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },
});
