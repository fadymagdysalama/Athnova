import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useExerciseLibraryStore } from '../../src/stores/exerciseLibraryStore';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/constants/theme';
import type { ExerciseTemplate } from '../../src/types';

// ─── Category constants ───────────────────────────────────────────────────────
const BUILT_IN_ORDER = ['push', 'pull', 'legs', 'core', 'cardio', 'other'];

const BUILT_IN_META: Record<string, { icon: string; accent: string; bg: string }> = {
  push:   { icon: '💪', accent: '#2563EB', bg: 'rgba(37,99,235,0.10)' },
  pull:   { icon: '🏋️', accent: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
  legs:   { icon: '🦵', accent: '#059669', bg: 'rgba(5,150,105,0.10)' },
  core:   { icon: '🔥', accent: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
  cardio: { icon: '🏃', accent: '#D97706', bg: 'rgba(217,119,6,0.10)' },
  other:  { icon: '⚡', accent: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
};

function getCategoryMeta(cat: string) {
  return BUILT_IN_META[cat] ?? { icon: '⭐', accent: colors.accent, bg: colors.accentFaded };
}

// ─── Add Category Modal ───────────────────────────────────────────────────────
function AddCategoryModal({
  visible,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const handleClose = () => { setName(''); onClose(); };
  const handleSave = () => { if (!name.trim()) return; onSave(name.trim()); setName(''); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.sheet}>
          <Text style={styles.modalTitle}>{t('library.addCategory')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('library.categoryNamePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, (!name.trim() || saving) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!name.trim() || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.textInverse} />
                : <Text style={styles.confirmBtnText}>{t('common.save')}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add / Edit Exercise Modal ────────────────────────────────────────────────
function AddExerciseModal({
  visible,
  defaultCategory,
  allCategories,
  exerciseToEdit,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  defaultCategory: string;
  allCategories: string[];
  exerciseToEdit?: ExerciseTemplate | null;
  onClose: () => void;
  onSave: (data: { name: string; category: string; video_url: string; default_notes: string; default_sets: string; default_reps: string }) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [videoUrl, setVideoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [defaultSets, setDefaultSets] = useState('');
  const [defaultReps, setDefaultReps] = useState('');

  // Pre-fill when editing; reset when adding
  useEffect(() => {
    if (exerciseToEdit) {
      setName(exerciseToEdit.name);
      setCategory(exerciseToEdit.category);
      setVideoUrl(exerciseToEdit.video_url ?? '');
      setNotes(exerciseToEdit.default_notes ?? '');
      setDefaultSets(exerciseToEdit.default_sets ?? '');
      setDefaultReps(exerciseToEdit.default_reps ?? '');
    } else {
      setName('');
      setCategory(defaultCategory);
      setVideoUrl('');
      setNotes('');
      setDefaultSets('');
      setDefaultReps('');
    }
  }, [exerciseToEdit, defaultCategory, visible]);

  const handleClose = () => { onClose(); };
  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name, category, video_url: videoUrl, default_notes: notes, default_sets: defaultSets, default_reps: defaultReps });
  };

  const isEdit = !!exerciseToEdit;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>
            {isEdit ? t('library.editExercise') : t('library.addExercise')}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('library.exerciseName')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('library.exerciseNamePlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('library.category')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catChipRow}>
              {allCategories.map((cat) => {
                const meta = getCategoryMeta(cat);
                const active = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, active && { borderColor: meta.accent, backgroundColor: meta.bg }]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catChipText, active && { color: meta.accent }]}>
                      {meta.icon} {BUILT_IN_META[cat] ? t(`library.category_${cat}` as any) : cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('library.videoUrl')}</Text>
            <TextInput
              style={styles.input}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor={colors.textMuted}
              value={videoUrl}
              onChangeText={setVideoUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('library.defaultNotes')}</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder={t('library.defaultNotesPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          <View style={styles.miniRow}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>{t('library.defaultSets')}</Text>
              <TextInput
                style={styles.inputMini}
                placeholder="3"
                placeholderTextColor={colors.textMuted}
                value={defaultSets}
                onChangeText={setDefaultSets}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>{t('library.defaultReps')}</Text>
              <TextInput
                style={styles.inputMini}
                placeholder="10-12"
                placeholderTextColor={colors.textMuted}
                value={defaultReps}
                onChangeText={setDefaultReps}
                maxLength={10}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (!name.trim() || saving) && styles.btnDisabled]}
            onPress={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.textInverse} />
              : <Text style={styles.saveBtnText}>
                  {isEdit ? t('library.saveChanges') : t('library.save')}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────
function CategorySection({
  categoryKey,
  displayName,
  exercises,
  isBuiltIn,
  onAddExercise,
  onEditExercise,
  onDeleteExercise,
  onDeleteCategory,
}: {
  categoryKey: string;
  displayName: string;
  exercises: ExerciseTemplate[];
  isBuiltIn: boolean;
  onAddExercise: () => void;
  onEditExercise: (ex: ExerciseTemplate) => void;
  onDeleteExercise: (id: string, name: string) => void;
  onDeleteCategory: () => void;
}) {
  const { t } = useTranslation();
  const meta = getCategoryMeta(categoryKey);

  return (
    <View style={styles.section}>
      {/* Section header — no collapse, just identity + actions */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconCircle, { backgroundColor: meta.bg }]}>
          <Text style={styles.sectionIcon}>{meta.icon}</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: meta.accent }]}>{displayName.toUpperCase()}</Text>

        <View style={[styles.countBadge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.countBadgeText, { color: meta.accent }]}>{exercises.length}</Text>
        </View>

        <View style={styles.sectionActions}>
          {/* Delete category (custom only) */}
          {!isBuiltIn && (
            <TouchableOpacity
              onPress={onDeleteCategory}
              style={[styles.iconBtn, styles.deleteIconBtn]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.deleteIconBtnText}>✕</Text>
            </TouchableOpacity>
          )}

          {/* Add exercise to this category */}
          <TouchableOpacity
            onPress={onAddExercise}
            style={[styles.addCatBtn, { borderColor: meta.accent, backgroundColor: meta.bg }]}
          >
            <Text style={[styles.addCatBtnText, { color: meta.accent }]}>+ {t('library.addExercise')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Exercises — always visible */}
      <View style={styles.sectionBody}>
        {exercises.length === 0 ? (
          <Text style={styles.emptySection}>{t('library.emptyCategoryHint')}</Text>
        ) : (
          exercises.map((ex, idx) => (
            <TouchableOpacity
              key={ex.id}
              style={[styles.exerciseItem, idx < exercises.length - 1 && styles.exerciseItemBorder]}
              onPress={() => onEditExercise(ex)}
              activeOpacity={0.75}
            >
              <View style={styles.exerciseLeft}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                {(ex.default_sets || ex.default_reps) ? (
                  <Text style={styles.exerciseSetsReps}>
                    {[ex.default_sets && `${ex.default_sets} sets`, ex.default_reps && `${ex.default_reps} reps`].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {ex.default_notes ? (
                  <Text style={styles.exerciseNotes} numberOfLines={1}>{ex.default_notes}</Text>
                ) : null}
              </View>
              <View style={styles.exerciseRight}>
                {ex.video_url ? <Text style={styles.videoIcon}>📹</Text> : null}
                <Text style={styles.editHint}>›</Text>
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation?.(); onDeleteExercise(ex.id, ex.name); }}
                  style={[styles.iconBtn, styles.deleteIconBtn]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.deleteIconBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LibraryScreen() {
  const { t } = useTranslation();
  const {
    exercises, customCategories, isLoading,
    fetch, add, update, remove, addCategory, removeCategory,
  } = useExerciseLibraryStore();

  const [showAddExercise, setShowAddExercise] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [addExerciseDefaultCat, setAddExerciseDefaultCat] = useState('push');
  const [editingExercise, setEditingExercise] = useState<ExerciseTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const { alertProps, showAlert } = useAppAlert();

  useEffect(() => { fetch(); }, []);

  // Built-ins first (in order), then custom alphabetically
  const allCategories = useMemo(
    () => [...BUILT_IN_ORDER, ...(customCategories ?? []).sort()],
    [customCategories]
  );

  // Group exercises by category
  const byCategory = useMemo(() => {
    const map: Record<string, ExerciseTemplate[]> = {};
    allCategories.forEach((c) => { map[c] = []; });
    exercises.forEach((ex) => {
      if (map[ex.category] !== undefined) {
        map[ex.category].push(ex);
      } else {
        map['other'] = [...(map['other'] ?? []), ex];
      }
    });
    return map;
  }, [exercises, allCategories]);

  // Which categories to render:
  // built-in → only if non-empty; custom → always (coach created them)
  const visibleCategories = useMemo(
    () => allCategories.filter((cat) => {
      if (BUILT_IN_ORDER.includes(cat)) return (byCategory[cat]?.length ?? 0) > 0;
      return true;
    }),
    [allCategories, byCategory]
  );

  const handleAddExercise = async (data: {
    name: string; category: string; video_url: string; default_notes: string; default_sets: string; default_reps: string;
  }) => {
    setSaving(true);
    const { error } = await add(data);
    setSaving(false);
    if (error) return showAlert({ title: t('common.error'), message: error });
    setShowAddExercise(false);
  };

  const handleUpdateExercise = async (data: {
    name: string; category: string; video_url: string; default_notes: string; default_sets: string; default_reps: string;
  }) => {
    if (!editingExercise) return;
    setSaving(true);
    const { error } = await update(editingExercise.id, data);
    setSaving(false);
    if (error) return showAlert({ title: t('common.error'), message: error });
    setEditingExercise(null);
  };

  const handleDeleteExercise = (id: string, name: string) => {
    showAlert({
      title: t('library.deleteTitle'),
      message: t('library.deleteConfirm', { name }),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            const { error } = await remove(id);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
  };

  const handleAddCategory = async (name: string) => {
    if (BUILT_IN_ORDER.includes(name.toLowerCase())) {
      return showAlert({ title: t('common.error'), message: t('library.categoryAlreadyExists') });
    }
    setSaving(true);
    const { error } = await addCategory(name);
    setSaving(false);
    if (error) return showAlert({ title: t('common.error'), message: error });
    setShowAddCategory(false);
  };

  const handleDeleteCategory = (cat: string) => {
    showAlert({
      title: t('library.deleteCategoryTitle'),
      message: t('library.deleteCategoryConfirm', { name: cat }),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            const { error } = await removeCategory(cat);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
  };

  const isEmptyLibrary = exercises.length === 0 && (customCategories ?? []).length === 0;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('library.title')}</Text>
          <Text style={styles.headerSub}>
            {exercises.length} {t('library.exercisesCount')}
            {(customCategories ?? []).length > 0
              ? `  ·  ${(customCategories ?? []).length} ${t('library.customCatsCount')}`
              : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowAddCategory(true)}>
            <Text style={styles.outlineBtnText}>+ {t('library.addCategory')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => { setAddExerciseDefaultCat('push'); setShowAddExercise(true); }}
          >
            <Text style={styles.primaryBtnText}>+ {t('library.addExercise')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing['4xl'] }} color={colors.primary} />
      ) : isEmptyLibrary ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🗂️</Text>
          <Text style={styles.emptyTitle}>{t('library.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('library.emptySubtitle')}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => { setAddExerciseDefaultCat('push'); setShowAddExercise(true); }}
          >
            <Text style={styles.primaryBtnText}>{t('library.addFirst')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {visibleCategories.map((cat) => {
            const isBuiltIn = BUILT_IN_ORDER.includes(cat);
            const displayName = isBuiltIn ? t(`library.category_${cat}` as any) : cat;
            return (
              <CategorySection
                key={cat}
                categoryKey={cat}
                displayName={displayName}
                exercises={byCategory[cat] ?? []}
                isBuiltIn={isBuiltIn}
                onAddExercise={() => { setAddExerciseDefaultCat(cat); setShowAddExercise(true); }}
                onEditExercise={(ex) => setEditingExercise(ex)}
                onDeleteExercise={handleDeleteExercise}
                onDeleteCategory={() => handleDeleteCategory(cat)}
              />
            );
          })}
        </ScrollView>
      )}

      <AddExerciseModal
        visible={showAddExercise}
        defaultCategory={addExerciseDefaultCat}
        allCategories={allCategories}
        exerciseToEdit={null}
        onClose={() => setShowAddExercise(false)}
        onSave={handleAddExercise}
        saving={saving}
      />

      <AddExerciseModal
        visible={editingExercise !== null}
        defaultCategory={editingExercise?.category ?? 'push'}
        allCategories={allCategories}
        exerciseToEdit={editingExercise}
        onClose={() => setEditingExercise(null)}
        onSave={handleUpdateExercise}
        saving={saving}
      />

      <AddCategoryModal
        visible={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        onSave={handleAddCategory}
        saving={saving}
      />
      <AppAlert {...alertProps} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  outlineBtn: {
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  outlineBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  primaryBtn: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
  },
  primaryBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textInverse },

  // List
  list: { padding: spacing['2xl'], gap: spacing.lg, paddingBottom: 80 },

  // Section card
  section: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  countBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 26,
    alignItems: 'center',
  },
  countBadgeText: { fontSize: fontSize.xs, fontWeight: '800' },
  iconBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentFaded,
  },
  addCatBtn: {
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  addCatBtnText: { fontSize: fontSize.xs, fontWeight: '700' },
  deleteIconBtn: { backgroundColor: 'rgba(220,38,38,0.10)' },
  deleteIconBtnText: { fontSize: 11, color: colors.error, fontWeight: '700' },
  editHint: { fontSize: 18, color: colors.textMuted, fontWeight: '300', marginRight: 2 },

  // Exercises in section
  sectionBody: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  exerciseItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  exerciseLeft: { flex: 1, gap: 2 },
  exerciseRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exerciseName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  exerciseSetsReps: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '600' },
  exerciseNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  videoIcon: { fontSize: 14 },
  emptySection: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
    fontStyle: 'italic',
  },

  // Empty full-screen state
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing['3xl'], paddingTop: spacing['4xl'], gap: spacing.lg,
  },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },

  // Shared modal
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing['2xl'],
    paddingBottom: 40,
    gap: spacing.lg,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  modalBtnRow: { flexDirection: 'row', gap: spacing.sm },
  cancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: borderRadius.lg, padding: spacing.lg, alignItems: 'center',
  },
  cancelBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  confirmBtn: {
    flex: 1, backgroundColor: colors.primary,
    borderRadius: borderRadius.lg, padding: spacing.lg, alignItems: 'center',
  },
  confirmBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textInverse },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  miniRow: { flexDirection: 'row', gap: spacing.md },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: fontSize.md, color: colors.text,
  },
  inputMini: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.md, color: colors.text, textAlign: 'center',
  },
  textarea: { minHeight: 72, textAlignVertical: 'top', paddingTop: spacing.md },
  catChipRow: { gap: spacing.sm, flexDirection: 'row' },
  catChip: {
    borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface,
  },
  catChipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.lg,
    padding: spacing.xl, alignItems: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 5,
  },
  btnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: fontSize.md, fontWeight: '800', color: colors.textInverse },
});
