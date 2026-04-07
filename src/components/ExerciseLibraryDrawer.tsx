import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useExerciseLibraryStore } from '../stores/exerciseLibraryStore';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import type { ExerciseTemplate } from '../types';

const BUILT_IN_ORDER = ['push', 'pull', 'legs', 'core', 'cardio', 'other'];

const BUILT_IN_ICONS: Record<string, string> = {
  push: '💪', pull: '🏋️', legs: '🦵', core: '🔥', cardio: '🏃', other: '⚡',
};

function getCatIcon(cat: string) {
  return BUILT_IN_ICONS[cat] ?? '⭐';
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: ExerciseTemplate) => void;
}

export function ExerciseLibraryDrawer({ visible, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { exercises, customCategories, isLoading, fetch } = useExerciseLibraryStore();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // All categories: built-in + custom
  const allCategories = useMemo(
    () => [...BUILT_IN_ORDER, ...(customCategories ?? []).sort()],
    [customCategories]
  );

  useEffect(() => {
    if (visible) {
      fetch();
      setSearch('');
      setActiveCategory('all');
    }
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((ex) => {
      const matchesCat = activeCategory === 'all' || ex.category === activeCategory;
      const matchesSearch = q === '' || ex.name.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [exercises, search, activeCategory]);

  const handleSelect = (ex: ExerciseTemplate) => {
    onSelect(ex);
    onClose();
  };

  const handleManage = () => {
    onClose();
    router.push('/(tabs)/library');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { maxHeight: height * 0.82 }]}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{t('library.drawerTitle')}</Text>
            <Text style={styles.headerSub}>{t('library.drawerSub')}</Text>
          </View>
          <TouchableOpacity onPress={handleManage} style={styles.manageBtn}>
            <Text style={styles.manageBtnText}>{t('library.manage')}</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('library.search')}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>

        {/* Category tabs */}
        <View style={styles.categoryRow}>
          <TouchableOpacity
            style={[styles.catChip, activeCategory === 'all' && styles.catChipActive]}
            onPress={() => setActiveCategory('all')}
          >
            <Text style={[styles.catChipText, activeCategory === 'all' && styles.catChipTextActive]}>
              {t('library.categoryAll')}
            </Text>
          </TouchableOpacity>
          {allCategories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.catChipText, activeCategory === cat && styles.catChipTextActive]}>
                {getCatIcon(cat)}{' '}
                {BUILT_IN_ORDER.includes(cat) ? t(`library.category_${cat}` as any) : cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* List */}
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: spacing['3xl'] }} color={colors.primary} />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {exercises.length === 0 ? t('library.emptyLibrary') : t('library.noResults')}
            </Text>
            {exercises.length === 0 && (
              <TouchableOpacity onPress={handleManage} style={styles.addFirstBtn}>
                <Text style={styles.addFirstBtnText}>{t('library.addFirst')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.item}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.itemIcon}>
                  <Text style={styles.itemIconText}>{getCatIcon(item.category)}</Text>
                </View>
                <View style={styles.itemBody}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>
                    {BUILT_IN_ORDER.includes(item.category)
                      ? t(`library.category_${item.category}` as any)
                      : item.category}
                    {item.video_url ? '  ·  📹' : ''}
                  </Text>
                </View>
                <Text style={styles.itemArrow}>→</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  manageBtn: {
    backgroundColor: colors.accentFaded,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  manageBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
  searchRow: {
    paddingHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  catChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  catChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentFaded,
  },
  catChipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
  },
  catChipTextActive: {
    color: colors.primary,
  },
  listContent: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.sm,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconText: { fontSize: 18 },
  itemBody: { flex: 1 },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  itemMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemArrow: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '700',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing['3xl'],
    gap: spacing.lg,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  addFirstBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  addFirstBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textInverse,
  },
});
