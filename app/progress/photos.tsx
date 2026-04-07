import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  StatusBar,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgressStore } from '../../src/stores/progressStore';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

type Label = 'front' | 'side' | 'back' | 'other';

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function PhotosScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { photos, fetchPhotos, uploadPhoto, deletePhoto, isLoading } = useProgressStore();

  const [uploading, setUploading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<Label>('front');
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ url: string; label: string; date: string } | null>(null);
  const { alertProps, showAlert } = useAppAlert();

  useEffect(() => { fetchPhotos(); }, []);

  const labels: { key: Label; label: string }[] = [
    { key: 'front', label: t('progress.labelFront') },
    { key: 'side', label: t('progress.labelSide') },
    { key: 'back', label: t('progress.labelBack') },
    { key: 'other', label: t('progress.labelOther') },
  ];

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: t('common.error'), message: 'Camera roll permission is required to upload photos.' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;

    setUploading(true);
    const { error } = await uploadPhoto(uri, selectedLabel, todayString());
    setUploading(false);

    if (error) {
      showAlert({ title: t('common.error'), message: error });
    }
  };

  const handleDelete = (id: string, url: string) => {
    showAlert({
      title: t('progress.deleteEntry'),
      message: t('progress.deleteConfirm'),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await deletePhoto(id, url);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
  };

  const labelKey = (label: string) =>
    `progress.label${label.charAt(0).toUpperCase()}${label.slice(1)}` as any;

  return (
    <View style={styles.root}>
      {/* Fullscreen photo viewer */}
      <Modal
        visible={fullscreenPhoto !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          <StatusBar hidden />
          <TouchableOpacity style={styles.modalClose} onPress={() => setFullscreenPhoto(null)}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          {fullscreenPhoto && (
            <>
              <Image
                source={{ uri: fullscreenPhoto.url }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
              <View style={styles.modalMeta}>
                <Text style={styles.modalLabel}>{t(labelKey(fullscreenPhoto.label))}</Text>
                <Text style={styles.modalDate}>{fullscreenPhoto.date}</Text>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('progress.photoTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Label selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('progress.selectLabel')}</Text>
          <View style={styles.labelRow}>
            {labels.map((l) => (
              <TouchableOpacity
                key={l.key}
                style={[styles.labelChip, selectedLabel === l.key && styles.labelChipActive]}
                onPress={() => setSelectedLabel(l.key)}
              >
                <Text
                  style={[
                    styles.labelChipText,
                    selectedLabel === l.key && styles.labelChipTextActive,
                  ]}
                >
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Upload button */}
        <TouchableOpacity
          style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
          onPress={handlePickPhoto}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.uploadButtonText}>📷  {t('progress.addPhoto')}</Text>
          )}
        </TouchableOpacity>

        {/* Gallery */}
        {isLoading && photos.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : photos.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📸</Text>
            <Text style={styles.emptyText}>{t('progress.noPhotos')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hintText}>{t('progress.longPressDelete')}</Text>
            <View style={styles.grid}>
              {photos.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.photoCard}
                  onPress={() => setFullscreenPhoto({ url: p.photo_url, label: p.label, date: p.date })}
                  onLongPress={() => handleDelete(p.id, p.photo_url)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: p.photo_url }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                  <View style={styles.photoMeta}>
                    <Text style={styles.photoLabel}>{t(labelKey(p.label))}</Text>
                    <Text style={styles.photoDate}>{p.date}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <AppAlert {...alertProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 60,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { marginBottom: spacing.sm },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },

  content: { padding: spacing['2xl'], paddingBottom: 80, gap: spacing.lg },

  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  labelRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  labelChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  labelChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  labelChipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  labelChipTextActive: { color: colors.textInverse },

  uploadButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md + 2,
    alignItems: 'center',
  },
  uploadButtonDisabled: { opacity: 0.6 },
  uploadButtonText: { color: colors.textInverse, fontWeight: '600', fontSize: fontSize.md },

  emptyState: { alignItems: 'center', paddingVertical: spacing['4xl'] },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted },

  hintText: { fontSize: fontSize.xs, color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photo: { width: '100%', aspectRatio: 1 },
  photoMeta: { padding: spacing.sm },
  photoLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  photoDate: { fontSize: fontSize.xs, color: colors.textMuted },

  // Fullscreen modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  fullscreenImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
  },
  modalMeta: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    gap: 4,
  },
  modalLabel: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
    textTransform: 'capitalize',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  modalDate: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs },
});
