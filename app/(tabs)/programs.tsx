import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Pressable, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useProgramStore } from '../../src/stores/programStore';
import { useOfflineClientStore } from '../../src/stores/offlineClientStore';
import { useDocumentStore, type CoachDocument } from '../../src/stores/documentStore';
import { supabase } from '../../src/lib/supabase';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { Program, CoachAssignment, OfflineClient } from '../../src/types';

// ─── Types for the grouped "By Client" view ───────────────────────────────────
interface OfflineClientProgram {
  assignmentId: string;
  programId: string;
  programTitle: string;
  currentDay: number;
  totalDays: number;
}

interface OfflineClientWithPrograms {
  client: OfflineClient;
  programs: OfflineClientProgram[];
}

interface OnGroundAppClientPrograms {
  profileId: string;
  displayName: string;
  username: string;
  requestId: string;
  programs: OfflineClientProgram[];
  offlineId: string | null;
}

// ─── Tag chip (small display-only) ────────────────────────────────────────────
function TagPill({ label }: { label: string }) {
  return (
    <View style={styles.tagPill}>
      <Text style={styles.tagPillText}>{label}</Text>
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

// ─── Library Card ─────────────────────────────────────────────────────────────
function LibraryCard({
  program,
  assignedCount,
  onPress,
  onAssign,
  onEdit,
  onDuplicate,
  onDelete,
  duplicating,
}: {
  program: Program;
  assignedCount: number;
  onPress: () => void;
  onAssign: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicating: boolean;
}) {
  return (
    <TouchableOpacity style={styles.libCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.libAccentBar} />
      <View style={styles.libCardInner}>
        {/* Title + duration */}
        <View style={styles.libTitleRow}>
          <Text style={styles.libCardTitle} numberOfLines={1}>{program.title}</Text>
          <View style={styles.libDurationChip}>
            <Text style={styles.libDurationText}>{program.duration_days}d</Text>
          </View>
        </View>

        {/* Live client count */}
        {assignedCount > 0 && (
          <View style={styles.libAssignedRow}>
            <View style={styles.libAssignedDot} />
            <Text style={styles.libAssignedText}>
              {assignedCount} client{assignedCount !== 1 ? 's' : ''} assigned
            </Text>
          </View>
        )}

        {/* Description */}
        {!!program.description && (
          <Text style={styles.libCardDesc} numberOfLines={2}>{program.description}</Text>
        )}

        {/* Tags */}
        {program.tags && program.tags.length > 0 && (
          <View style={styles.tagRow}>
            {program.tags.map((tag) => <TagPill key={tag} label={tag} />)}
          </View>
        )}

        {/* Actions */}
        <View style={styles.libCardFooter}>
          <TouchableOpacity style={styles.assignPrimary} onPress={onAssign} activeOpacity={0.85}>
            <Text style={styles.assignPrimaryText}>Assign  →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardIconBtn} onPress={onEdit} activeOpacity={0.75}>
            <Text style={styles.cardIconBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardIconBtn} onPress={onDuplicate} disabled={duplicating} activeOpacity={0.75}>
            {duplicating
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={styles.cardIconBtnText}>Copy</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cardIconBtn, styles.cardIconBtnDanger]} onPress={onDelete} activeOpacity={0.75}>
            <Text style={[styles.cardIconBtnText, { color: colors.error }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Coach View (Library + By Client + Docs tabs) ────────────────────────────
function CoachView() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const {
    myPrograms, coachAssignments, offlineAssignmentCounts, isLoading,
    fetchMyPrograms, fetchCoachAssignments,
    deleteProgram, duplicateProgram,
  } = useProgramStore();
  const { documents, uploading, fetchMyDocuments, pickAndUpload, deleteDocument, openDocument, previewDocument, assignToAll, assignToClient } = useDocumentStore();
  const { clients, fetchCoachData } = useConnectionStore();
  const { offlineClients, fetchOfflineClients } = useOfflineClientStore();
  const [activeTab, setActiveTab] = useState<'library' | 'docs'>('library');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  // Docs upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docDesc, setDocDesc] = useState('');
  const [docVisibility, setDocVisibility] = useState<'all' | 'specific' | 'none'>('all');
  const [docClientIds, setDocClientIds] = useState<string[]>([]);

  // Assign-later state
  const [assigningDoc, setAssigningDoc] = useState<CoachDocument | null>(null);
  const [assignClientIds, setAssignClientIds] = useState<string[]>([]);
  const [assignAll, setAssignAll] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const { alertProps, showAlert } = useAppAlert();

  useFocusEffect(useCallback(() => {
    fetchMyPrograms();
    fetchCoachAssignments();
    fetchMyDocuments();
    fetchCoachData(true);
    fetchOfflineClients();
  }, [fetchMyPrograms, fetchCoachAssignments, fetchMyDocuments, fetchCoachData, fetchOfflineClients]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchMyPrograms(), fetchCoachAssignments(), fetchMyDocuments(), fetchOfflineClients()]);
    setRefreshing(false);
  };

  const handleDelete = (p: Program) => {
    showAlert({
      title: t('programs.deleteProgram'),
      message: p.title,
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteProgram(p.id);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
  };

  const handleDuplicate = async (p: Program) => {
    setDuplicating(p.id);
    const { id: newId, error } = await duplicateProgram(p.id);
    setDuplicating(null);
    if (error) { showAlert({ title: t('common.error'), message: error }); return; }
    if (newId) router.push({ pathname: '/programs/edit', params: { id: newId } });
  };

  const allTags = Array.from(new Set(myPrograms.flatMap((p) => p.tags ?? [])));
  const filteredPrograms = myPrograms.filter((p) => {
    const matchesTag = !selectedTag || p.tags?.includes(selectedTag);
    const matchesSearch = !searchQuery.trim() || p.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesTag && matchesSearch;
  });

  if (isLoading && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* ── Stats banner ── */}
      <View style={styles.statsBanner}>
        <View style={styles.statsBannerItem}>
          <Text style={styles.statsBannerValue}>{myPrograms.length}</Text>
          <Text style={styles.statsBannerLabel}>Programs</Text>
        </View>
        <View style={styles.statsBannerDivider} />
        <View style={styles.statsBannerItem}>
          <Text style={styles.statsBannerValue}>
            {coachAssignments.filter((a, i, arr) => arr.findIndex(x => x.client?.id === a.client?.id) === i).length
              + clients.filter(({ request }) => ((request as any).client_mode ?? 'online') === 'offline').length
              + offlineClients.length}
          </Text>
          <Text style={styles.statsBannerLabel}>Clients</Text>
        </View>
        <View style={styles.statsBannerDivider} />
        <View style={styles.statsBannerItem}>
          <Text style={styles.statsBannerValue}>{coachAssignments.length}</Text>
          <Text style={styles.statsBannerLabel}>Active</Text>
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'library' && styles.tabBtnActive]}
          onPress={() => setActiveTab('library')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === 'library' && styles.tabBtnTextActive]}>
            Library ({filteredPrograms.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'docs' && styles.tabBtnActive]}
          onPress={() => setActiveTab('docs')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === 'docs' && styles.tabBtnTextActive]}>
            Docs ({documents.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {activeTab === 'library' ? (
          <>
            {/* Search bar */}
            <TextInput
              style={styles.librarySearch}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search programs..."
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {allTags.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagFilterScroll}>
                <TouchableOpacity
                  style={[styles.tagFilter, selectedTag === null && styles.tagFilterActive]}
                  onPress={() => setSelectedTag(null)}
                >
                  <Text style={[styles.tagFilterText, selectedTag === null && styles.tagFilterTextActive]}>All</Text>
                </TouchableOpacity>
                {allTags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tagFilter, selectedTag === tag && styles.tagFilterActive]}
                    onPress={() => setSelectedTag(tag === selectedTag ? null : tag)}
                  >
                    <Text style={[styles.tagFilterText, selectedTag === tag && styles.tagFilterTextActive]}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {filteredPrograms.length === 0 ? (
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
              filteredPrograms.map((p) => {
                const assignedCount =
                  coachAssignments.filter((a) => a.program_id === p.id).length +
                  (offlineAssignmentCounts[p.id] ?? 0);
                return (
                  <LibraryCard
                    key={p.id}
                    program={p}
                    assignedCount={assignedCount}
                    onPress={() => router.push({ pathname: '/programs/detail', params: { id: p.id } })}
                    onAssign={() => router.push({ pathname: '/programs/assign', params: { id: p.id } })}
                    onEdit={() => router.push({ pathname: '/programs/edit', params: { id: p.id } })}
                    onDuplicate={() => handleDuplicate(p)}
                    onDelete={() => handleDelete(p)}
                    duplicating={duplicating === p.id}
                  />
                );
              })
            )}
          </>
        ) : (
          /* ── Docs tab ─────────────────────────────────────────────── */
          <>
            <TouchableOpacity
              style={styles.uploadDocBtn}
              onPress={() => setShowUploadModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.uploadDocBtnText}>+ Upload Document</Text>
            </TouchableOpacity>
            {documents.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}><Text style={styles.emptyIconPlus}>📄</Text></View>
                <Text style={styles.emptyTitle}>No documents yet</Text>
                <Text style={styles.emptyHint}>Upload PDFs, nutrition plans, or guidelines for your clients</Text>
              </View>
            ) : (
              documents.map((doc) => {
                const isAll = doc.assignments?.some((a) => a.client_id === null);
                const specificCount = doc.assignments?.filter((a) => a.client_id !== null).length ?? 0;
                return (
                  <View key={doc.id} style={styles.docCard}>
                    {/* Tapping icon/text opens the doc */}
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.md }}
                      onPress={() =>
                        showAlert({
                          title: doc.title,
                          message: doc.description ?? doc.file_name,
                          buttons: [
                            { text: 'Preview', onPress: () => previewDocument(doc) },
                            { text: 'Share / Save', onPress: () => openDocument(doc, doc.coach_id) },
                            { text: 'Cancel', style: 'cancel' },
                          ],
                        })
                      }
                      activeOpacity={0.75}
                    >
                      <View style={styles.docIconBox}>
                        <View style={{ width: 14, height: 18, borderWidth: 2, borderColor: colors.primary, borderRadius: 2 }}>
                          <View style={{ position: 'absolute', top: -1, right: -1, width: 6, height: 6, backgroundColor: colors.background, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.primary }} />
                          <View style={{ marginTop: 5, marginLeft: 2, gap: 2 }}>
                            <View style={{ width: 8, height: 1.5, backgroundColor: colors.primary, borderRadius: 1 }} />
                            <View style={{ width: 8, height: 1.5, backgroundColor: colors.primary, borderRadius: 1 }} />
                            <View style={{ width: 5, height: 1.5, backgroundColor: colors.primary, borderRadius: 1 }} />
                          </View>
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
                        {!!doc.description && <Text style={styles.docDesc} numberOfLines={2}>{doc.description}</Text>}
                        <Text style={styles.docMeta}>
                          {isAll ? 'All clients' : specificCount > 0 ? `${specificCount} client${specificCount !== 1 ? 's' : ''}` : 'Not assigned'}
                          {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {/* Assign button — separate from open */}
                    <TouchableOpacity
                      style={styles.docAssignBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => {
                        const currentAll = doc.assignments?.some((a) => a.client_id === null) ?? false;
                        const currentIds = doc.assignments?.filter((a) => a.client_id !== null).map((a) => a.client_id as string) ?? [];
                        setAssignAll(currentAll);
                        setAssignClientIds(currentIds);
                        setAssigningDoc(doc);
                      }}
                    >
                      <Text style={styles.docAssignBtnText}>Assign</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.docDeleteBtn}
                      onPress={() => showAlert({
                        title: 'Delete Document',
                        message: `Delete "${doc.title}"?`,
                        buttons: [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteDocument(doc) },
                        ],
                      })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.docDeleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* ── Assign Document Modal ── */}
      <Modal
        visible={!!assigningDoc}
        transparent
        animationType="fade"
        onRequestClose={() => setAssigningDoc(null)}
      >
        <KeyboardAvoidingView
          style={styles.menuBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setAssigningDoc(null)} />
          <View style={styles.uploadModal}>
            <Text style={styles.uploadModalTitle}>Assign “{assigningDoc?.title}”</Text>

            {/* All clients toggle */}
            <TouchableOpacity
              style={[styles.clientPickRow, assignAll && styles.clientPickRowActive]}
              onPress={() => { setAssignAll((v) => !v); }}
            >
              <Text style={[styles.clientPickName, assignAll && { color: '#fff' }]}>All current & future clients</Text>
              {assignAll && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
            </TouchableOpacity>

            {/* Individual clients — always visible, disabled when All is on */}
            <Text style={[styles.uploadVisLabel, { marginTop: spacing.sm }]}>Or pick specific clients:</Text>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {clients.map((c) => {
                const id = c.profile.id;
                const active = assignClientIds.includes(id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[
                      styles.clientPickRow,
                      active && !assignAll && styles.clientPickRowActive,
                      { marginTop: spacing.xs },
                      assignAll && { opacity: 0.4 },
                    ]}
                    disabled={assignAll}
                    onPress={() =>
                      setAssignClientIds((prev) =>
                        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                      )
                    }
                  >
                    <Text style={[styles.clientPickName, active && !assignAll && { color: '#fff' }]}>{c.profile.display_name}</Text>
                    {active && !assignAll && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.uploadActions}>
              <TouchableOpacity style={styles.uploadCancelBtn} onPress={() => setAssigningDoc(null)}>
                <Text style={styles.uploadCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.uploadPickBtn, assigning && { opacity: 0.5 }]}
                disabled={assigning}
                onPress={async () => {
                  if (!assigningDoc) return;
                  setAssigning(true);
                  await supabase
                    .from('coach_document_assignments')
                    .delete()
                    .eq('document_id', assigningDoc.id);
                  if (assignAll) {
                    await assignToAll(assigningDoc.id);
                  } else {
                    await Promise.all(assignClientIds.map((cid) => assignToClient(assigningDoc.id, cid)));
                  }
                  await fetchMyDocuments();
                  setAssigning(false);
                  setAssigningDoc(null);
                }}
              >
                {assigning
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.uploadPickText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Upload Document Modal ── */}
      <Modal
        visible={showUploadModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUploadModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.menuBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setShowUploadModal(false)} />
          <View style={styles.uploadModal}>
            <Text style={styles.uploadModalTitle}>Upload Document</Text>

            <TextInput
              style={styles.uploadInput}
              placeholder="Title (e.g. Nutrition Plan)"
              placeholderTextColor="#999"
              value={docTitle}
              onChangeText={setDocTitle}
            />
            <TextInput
              style={[styles.uploadInput, { height: 72 }]}
              placeholder="Description (optional)"
              placeholderTextColor="#999"
              value={docDesc}
              onChangeText={setDocDesc}
              multiline
            />

            {/* Visibility */}
            <View style={styles.uploadVisRow}>
              <Text style={styles.uploadVisLabel}>Assign to:</Text>
              {(['all', 'specific', 'none'] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.uploadVisPill, docVisibility === v && styles.uploadVisPillActive]}
                  onPress={() => setDocVisibility(v)}
                >
                  <Text style={[styles.uploadVisPillText, docVisibility === v && styles.uploadVisPillTextActive]}>
                    {v === 'all' ? 'All clients' : v === 'specific' ? 'Specific' : 'No one yet'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {docVisibility === 'none' && (
              <Text style={[styles.uploadVisLabel, { fontSize: fontSize.xs, marginTop: -spacing.xs }]}>
                You can assign this document to clients later from the Docs tab.
              </Text>
            )}

            {/* Client picker when specific */}
            {docVisibility === 'specific' && (
              <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                {clients.map((c) => {
                  const id = c.profile.id;
                  const active = docClientIds.includes(id);
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[styles.clientPickRow, active && styles.clientPickRowActive]}
                      onPress={() =>
                        setDocClientIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                        )
                      }
                    >
                      <Text style={[styles.clientPickName, active && { color: '#fff' }]}>
                        {c.profile.display_name}
                      </Text>
                      {active && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.uploadActions}>
              <TouchableOpacity
                style={styles.uploadCancelBtn}
                onPress={() => setShowUploadModal(false)}
              >
                <Text style={styles.uploadCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.uploadPickBtn, (!docTitle.trim() || uploading) && { opacity: 0.5 }]}
                disabled={!docTitle.trim() || uploading}
                onPress={async () => {
                  const { error } = await pickAndUpload(
                    docTitle.trim(),
                    docDesc.trim(),
                    docVisibility === 'all',
                    docVisibility === 'specific' ? docClientIds : [],
                    // 'none' → visibleToAll=false, clientIds=[] → uploaded but unassigned
                  );
                  if (error) { showAlert({ title: 'Upload failed', message: error }); return; }
                  setShowUploadModal(false);
                  setDocTitle('');
                  setDocDesc('');
                  setDocVisibility('all');
                  setDocClientIds([]);
                }}
              >
                {uploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.uploadPickText}>Pick & Upload File</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <AppAlert {...alertProps} />
    </View>
  );
}

function ClientView() {
  const { t } = useTranslation();
  const router = useRouter();
  const { assignments, isLoading, fetchAssignedPrograms } = useProgramStore();
  const { myCoach } = useConnectionStore();
  const { clientDocuments, fetchClientDocuments, openDocument, previewDocument } = useDocumentStore();
  const { profile } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const { alertProps, showAlert } = useAppAlert();

  useFocusEffect(useCallback(() => {
    fetchAssignedPrograms();
    if (myCoach?.id && profile?.id) {
      fetchClientDocuments(myCoach.id, profile.id);
    }
  }, [fetchAssignedPrograms, fetchClientDocuments, myCoach?.id, profile?.id]));

  // Re-fetch documents if myCoach loads after initial focus
  useEffect(() => {
    if (myCoach?.id && profile?.id) {
      fetchClientDocuments(myCoach.id, profile.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCoach?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchAssignedPrograms(),
      myCoach?.id && profile?.id ? fetchClientDocuments(myCoach.id, profile.id) : Promise.resolve(),
    ]);
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
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.accentFaded }]}>
            <Text style={{ fontSize: 28 }}>📋</Text>
          </View>
          <Text style={styles.emptyTitle}>{t('programs.noAssigned')}</Text>
          <Text style={styles.emptyHint}>Your coach will assign programs here</Text>
        </View>
      ) : (
        assignments.map(({ program, current_day, completed_days_count, id }) => {
          const diffColor = colors.primary;
          const completedCount = completed_days_count ?? 0;
          const donePct = Math.min(
            (completedCount / Math.max(program.duration_days, 1)) * 100,
            100,
          );
          return (
            <TouchableOpacity
              key={id}
              style={styles.clientCard}
              onPress={() => router.push({ pathname: '/programs/detail', params: { id: program.id } })}
              activeOpacity={0.85}
            >
              {/* Difficulty accent strip */}
              <View style={[styles.clientCardStrip, { backgroundColor: diffColor }]} />

              <View style={styles.clientCardBody}>
                {/* Title */}
                <View style={styles.programCardTop}>
                  <Text style={styles.programTitle} numberOfLines={1}>{program.title}</Text>
                </View>

                {/* Description */}
                {!!program.description && (
                  <Text style={styles.programDesc} numberOfLines={2}>{program.description}</Text>
                )}

                {/* Progress */}
                <View style={styles.clientProgressBlock}>
                  <View style={styles.clientProgressRow}>
                    <Text style={styles.clientProgressLabel}>
                      {completedCount} / {program.duration_days} days
                    </Text>
                    <Text style={[styles.clientProgressPct, { color: diffColor }]}>
                      {Math.round(donePct)}%
                    </Text>
                  </View>
                  <View style={styles.clientProgressTrack}>
                    <View
                      style={[
                        styles.clientProgressFill,
                        { width: `${Math.round(donePct)}%` as any, backgroundColor: diffColor },
                      ]}
                    />
                  </View>
                </View>

                {/* Continue button */}
                <TouchableOpacity
                  style={[styles.clientContinueBtn, { backgroundColor: diffColor }]}
                  onPress={() => router.push({ pathname: '/programs/detail', params: { id: program.id } })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.clientContinueBtnText}>Continue  →</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* ── Coach Documents ─────────────────────────────────────────── */}
      <>
        <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>
          📄 Documents from Coach
        </Text>
        {clientDocuments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 14 }}>
              No documents from your coach yet
            </Text>
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
                  <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
                  {!!doc.description && (
                    <Text style={styles.docDesc} numberOfLines={2}>{doc.description}</Text>
                  )}
                  <Text style={styles.docMeta}>Tap to preview</Text>
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
      <AppAlert {...alertProps} />
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
            <Text style={styles.createBtnText}>{t('programs.createProgram')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {isCoach ? <CoachView /> : <ClientView />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
  },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  createBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 1,
    borderRadius: borderRadius.full,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  createBtnText: { color: '#ffffff', fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 0.2 },
  container: { flex: 1 },
  content: { paddingHorizontal: spacing['2xl'], paddingTop: spacing.md, paddingBottom: spacing['4xl'], gap: spacing.md },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Tab row ────────────────────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  tabBtnTextActive: { color: '#fff' },

  // ── Tag filter strip ───────────────────────────────────────────────────────
  librarySearch: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.md,
  },
  tagFilterScroll: { marginBottom: spacing.md },
  tagFilter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  tagFilterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tagFilterText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  tagFilterTextActive: { color: '#fff' },

  // ── Library card ───────────────────────────────────────────────────────────
  libCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  libAccentBar: {
    width: 5,
    backgroundColor: colors.primary,
  },
  libCardInner: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  libTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  libDurationChip: {
    backgroundColor: colors.accentFaded,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  libDurationText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  libAssignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  libAssignedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  libAssignedText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.success,
  },
  coachOnlyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '18',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  coachOnlyBadgeText: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  libCardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  libCardDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tagPill: {
    backgroundColor: colors.accentFaded,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  tagPillText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.accent },
  libCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  assignPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm + 1,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  assignPrimaryText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  cardIconBtn: {
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  cardIconBtnDanger: {
    borderColor: colors.errorFaded,
    backgroundColor: colors.errorFaded,
  },
  cardIconBtnText: { fontSize: 15, color: colors.accent, lineHeight: 18 },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtnText: { fontSize: 16, color: colors.textMuted, lineHeight: 18, letterSpacing: 1 },

  // ── Active assignment card ─────────────────────────────────────────────────
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: { backgroundColor: colors.primary + '22', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.primary, fontWeight: '800' },
  activeInfo: { flex: 1 },
  activeName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  activeProg: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  activeProgressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  activeTrack: { flex: 1, height: 6, backgroundColor: colors.surfaceLight, borderRadius: 3, overflow: 'hidden' },
  activeFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  activePct: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary, width: 32, textAlign: 'right' },
  activeDays: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  activeChevron: { fontSize: 22, color: colors.textMuted, fontWeight: '300' },

  // ── By-Client grouped view ────────────────────────────────────────────────
  clientGroupBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  clientGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  clientGroupLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  clientGroupCount: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.accentFaded,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  byClientCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  byClientTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  byClientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentFaded,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  byClientAvatarText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.accent,
  },
  byClientName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  byClientSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  byClientAssignBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  byClientAssignBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: '#fff' },
  byClientProgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  byClientProgName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  byClientProgTrack: {
    height: 5,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  byClientProgFill: { height: 5, borderRadius: 3 },
  byClientProgPct: { fontSize: fontSize.xs, fontWeight: '600' },
  byClientChevron: { fontSize: 20, color: colors.textMuted, fontWeight: '300' },
  byClientNoProg: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
  },


  statsBanner: {
    flexDirection: 'row',
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  statsBannerItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 2,
  },
  statsBannerValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  statsBannerLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
  statsBannerDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },

  // ── Tab alert dot ────────────────────────────────────────────────────
  tabAlertDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warning,
    position: 'absolute',
    top: 4,
    right: 8,
  },

  // ── Attention badge on ActiveCard ───────────────────────────────────────
  activeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  attentionBadge: {
    backgroundColor: colors.warningFaded,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  attentionBadgeText: { fontSize: 10, fontWeight: '700', color: colors.warning },

  // ── Active filter pills ────────────────────────────────────────────────
  activeFilterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  activeFilterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeFilterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  activeFilterText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  activeFilterTextActive: { color: '#fff' },

  // ── Program context menu ────────────────────────────────────────────────
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing['2xl'],
    paddingBottom: 36,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  menuTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOptionText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  menuCancel: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  menuCancelText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },

  // ── Empty ─────────────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing['3xl'],
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginTop: spacing.xl,
  },
  emptyIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.accentFaded,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
  },
  emptyIconPlus: { fontSize: 30, color: colors.accent, lineHeight: 36, fontWeight: '300' },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyHint: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },

  // ── Client program card ───────────────────────────────────────────────────
  programTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, flex: 1, marginRight: spacing.sm, letterSpacing: -0.2 },
  programDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  programCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  clientCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  clientCardStrip: { height: 5 },
  clientCardBody: { padding: spacing.xl, gap: spacing.md },
  clientProgressBlock: { gap: spacing.xs },
  clientProgressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientProgressLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  clientProgressPct: { fontSize: fontSize.sm, fontWeight: '800' },
  clientProgressTrack: {
    height: 8, backgroundColor: colors.surfaceLight, borderRadius: 4,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  clientProgressFill: { height: '100%', borderRadius: 4 },
  clientContinueBtn: {
    borderRadius: borderRadius.full, paddingVertical: spacing.md, alignItems: 'center',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 3,
  },
  clientContinueBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 0.3 },

  // ── Documents tab ──────────────────────────────────────────────────────────
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm },
  uploadDocBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  uploadDocBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  docIconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: 2 },
  docDesc: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 16, marginBottom: 4 },
  docMeta: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  docDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.errorFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docDeleteBtnText: { fontSize: 12, fontWeight: '700', color: colors.error },
  docAssignBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accentFaded,
    marginRight: spacing.xs,
  },
  docAssignBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.accent },

  // ── Upload doc modal ───────────────────────────────────────────────────────
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  uploadModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing['2xl'],
    paddingBottom: 40,
    gap: spacing.md,
  },
  uploadModalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  uploadInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  uploadVisRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  uploadVisLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted, marginRight: spacing.xs },
  uploadVisPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
  },
  uploadVisPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  uploadVisPillText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  uploadVisPillTextActive: { color: '#fff' },
  clientPickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clientPickRowActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  clientPickName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  uploadActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  uploadCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  uploadCancelText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },
  uploadPickBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  uploadPickText: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },
});
