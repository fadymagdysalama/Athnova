import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { CalendarPicker } from '../../src/components/CalendarPicker';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { Profile } from '../../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EditSessionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const {
    currentSession,
    fetchSessionDetail,
    updateSession,
    addClientToSession,
    removeClientFromSession,
    isLoading,
  } = useSessionStore();
  const { clients, fetchCoachData } = useConnectionStore();

  const todayStr = getTodayStr();

  // Form fields
  const [date, setDate] = useState('');
  const [hourInput, setHourInput] = useState('9');
  const [minuteInput, setMinuteInput] = useState('00');
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [duration, setDuration] = useState('60');
  const [maxClients, setMaxClients] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [originalClientIds, setOriginalClientIds] = useState<string[]>([]);
  const [bookingCutoffHours, setBookingCutoffHours] = useState(2);
  const [cancellationCutoffHours, setCancellationCutoffHours] = useState(2);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth() + 1);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sessionId) fetchSessionDetail(sessionId);
    fetchCoachData();
  }, [sessionId]);

  // Pre-fill form once session loads
  useEffect(() => {
    if (!currentSession || currentSession.id !== sessionId) return;

    setDate(currentSession.date);

    const timeParts = currentSession.start_time.split(':');
    const h24 = parseInt(timeParts[0] ?? '9', 10);
    const isPM = h24 >= 12;
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    setHourInput(String(h12));
    setMinuteInput(timeParts[1] ?? '00');
    setAmpm(isPM ? 'PM' : 'AM');

    setDuration(String(currentSession.duration_minutes));
    setMaxClients(currentSession.max_clients != null ? String(currentSession.max_clients) : '');
    setNotes(currentSession.notes ?? '');
    setBookingCutoffHours(currentSession.booking_cutoff_hours ?? 2);
    setCancellationCutoffHours(currentSession.cancellation_cutoff_hours ?? 2);

    const ids = currentSession.clients.map((c) => c.id);
    setSelectedClientIds(ids);
    setOriginalClientIds(ids);

    // Sync picker view to session month
    const [y, m] = currentSession.date.split('-').map(Number);
    setPickerYear(y);
    setPickerMonth(m);
  }, [currentSession?.id]);

  function toggleClient(id: string) {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function to24h(): number {
    let h = parseInt(hourInput, 10);
    if (ampm === 'AM' && h === 12) h = 0;
    else if (ampm === 'PM' && h !== 12) h += 12;
    return h;
  }

  function validateTime(): string | null {
    const h = parseInt(hourInput, 10);
    const m = parseInt(minuteInput, 10);
    if (isNaN(h) || h < 1 || h > 12) return 'Hour must be 1–12';
    if (isNaN(m) || m < 0 || m > 59) return 'Minute must be 0–59';
    return null;
  }

  async function handleSave() {
    if (!sessionId) return;

    const timeError = validateTime();
    if (timeError) { Alert.alert(t('common.error'), timeError); return; }

    const durationNum = parseInt(duration, 10);
    if (!durationNum || durationNum < 5) {
      Alert.alert(t('common.error'), t('schedule.duration') + ' must be at least 5');
      return;
    }

    const start_time = `${String(to24h()).padStart(2, '0')}:${minuteInput.padStart(2, '0')}`;

    const maxClientsNum = maxClients.trim() ? parseInt(maxClients, 10) : null;
    if (maxClientsNum !== null && (isNaN(maxClientsNum) || maxClientsNum < 1)) {
      Alert.alert(t('common.error'), t('schedule.maxClients') + ' must be at least 1');
      return;
    }

    setSaving(true);

    const { error: updateError } = await updateSession(sessionId, {
      date,
      start_time,
      duration_minutes: durationNum,
      notes: notes.trim() || null,
      max_clients: maxClientsNum,
      booking_cutoff_hours: bookingCutoffHours,
      cancellation_cutoff_hours: cancellationCutoffHours,
    });

    if (updateError) {
      setSaving(false);
      const msg = updateError === 'overlap' ? t('schedule.overlapError') : updateError;
      Alert.alert(t('common.error'), msg);
      return;
    }

    // Participant diff
    const toAdd = selectedClientIds.filter((id) => !originalClientIds.includes(id));
    const toRemove = originalClientIds.filter((id) => !selectedClientIds.includes(id));

    await Promise.all([
      ...toAdd.map((id) => addClientToSession(sessionId, id)),
      ...toRemove.map((id) => removeClientFromSession(sessionId, id)),
    ]);

    setSaving(false);
    router.back();
  }

  function pickerPrevMonth() {
    if (pickerMonth === 1) { setPickerYear((y) => y - 1); setPickerMonth(12); }
    else setPickerMonth((m) => m - 1);
  }

  function pickerNextMonth() {
    if (pickerMonth === 12) { setPickerYear((y) => y + 1); setPickerMonth(1); }
    else setPickerMonth((m) => m + 1);
  }

  if (isLoading && !date) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('schedule.editSession')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Date ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.date')}</Text>
            <TouchableOpacity
              style={styles.selectField}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.selectFieldText}>
                {date ? formatDisplayDate(date) : t('schedule.selectDate')}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* ── Time ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.time')}</Text>
            <View style={styles.timeRow}>
              <TextInput
                style={[styles.input, styles.timeInput]}
                value={hourInput}
                onChangeText={(v) => setHourInput(v.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="9"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.timeSep}>:</Text>
              <TextInput
                style={[styles.input, styles.timeInput]}
                value={minuteInput}
                onChangeText={(v) => setMinuteInput(v.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="00"
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity
                style={styles.ampmBtn}
                onPress={() => setAmpm((a) => (a === 'AM' ? 'PM' : 'AM'))}
                activeOpacity={0.8}
              >
                <Text style={styles.ampmText}>{ampm}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Duration ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.duration')}</Text>
            <TextInput
              style={styles.input}
              value={duration}
              onChangeText={(v) => setDuration(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder={t('schedule.durationPlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* ── Max Participants ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.maxClients')}</Text>
            <TextInput
              style={styles.input}
              value={maxClients}
              onChangeText={(v) => setMaxClients(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder={t('schedule.maxClientsPlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldHint}>{t('schedule.maxClientsHint')}</Text>
          </View>

          {/* ── Booking Policy ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.bookingCutoff')}</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setBookingCutoffHours((h) => Math.max(0, h - 1))} activeOpacity={0.8}>
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.stepperValueBox}>
                <Text style={styles.stepperValue}>{bookingCutoffHours}</Text>
                <Text style={styles.stepperUnit}>{t('schedule.hoursBeforeStart')}</Text>
              </View>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setBookingCutoffHours((h) => h + 1)} activeOpacity={0.8}>
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldHint}>{t('schedule.bookingCutoffHint')}</Text>
          </View>

          {/* ── Cancellation Policy ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.cancellationCutoff')}</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setCancellationCutoffHours((h) => Math.max(0, h - 1))} activeOpacity={0.8}>
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.stepperValueBox}>
                <Text style={styles.stepperValue}>{cancellationCutoffHours}</Text>
                <Text style={styles.stepperUnit}>{t('schedule.hoursBeforeStart')}</Text>
              </View>
              <TouchableOpacity style={styles.stepperBtn} onPress={() => setCancellationCutoffHours((h) => h + 1)} activeOpacity={0.8}>
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldHint}>{t('schedule.cancellationCutoffHint')}</Text>
          </View>

          {/* ── Participants ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.participants')}</Text>
            {clients.length === 0 ? (
              <View style={styles.emptyClients}>
                <Text style={styles.emptyClientsText}>{t('schedule.noParticipants')}</Text>
              </View>
            ) : (
              clients.map(({ profile: p }: { profile: Profile }) => {
                const isSelected = selectedClientIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.clientRow, isSelected && styles.clientRowSelected]}
                    onPress={() => toggleClient(p.id)}
                    activeOpacity={0.8}
                  >
                    <Avatar name={p.display_name} />
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{p.display_name}</Text>
                      <Text style={styles.clientUsername}>@{p.username}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {/* ── Notes ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.notes')}</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('schedule.notesPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* ── Save button ── */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.saveBtnText}>{t('schedule.saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Date picker modal ── */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <CalendarPicker
              selectedDate={date || todayStr}
              viewYear={pickerYear}
              viewMonth={pickerMonth}
              onSelectDate={(d) => {
                setDate(d);
                setShowDatePicker(false);
              }}
              onPrevMonth={pickerPrevMonth}
              onNextMonth={pickerNextMonth}
              minDate={todayStr}
            />
          </View>
        </TouchableOpacity>
      </Modal>
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

  scrollContent: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['5xl'],
  },

  fieldGroup: { marginBottom: spacing['2xl'] },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  input: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.md },

  selectField: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectFieldText: { fontSize: fontSize.md, color: colors.text },
  chevron: { fontSize: 20, color: colors.textMuted, fontWeight: '600' },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeInput: { width: 66, textAlign: 'center' },
  timeSep: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  ampmBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    minWidth: 52,
    alignItems: 'center' as const,
  },
  ampmText: {
    color: colors.textInverse,
    fontWeight: '700' as const,
    fontSize: fontSize.sm,
  },

  emptyClients: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyClientsText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },

  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  clientRowSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  clientInfo: { flex: 1, marginLeft: spacing.md },
  clientName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  clientUsername: { fontSize: fontSize.xs, color: colors.textMuted },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.textInverse, fontSize: 12, fontWeight: '700' },

  avatar: {
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '700' },

  fieldHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  stepperRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  stepperBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  stepperBtnText: { fontSize: 24, fontWeight: '300', color: colors.primary, lineHeight: 28 },
  stepperValueBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  stepperValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  stepperUnit: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted, marginTop: 1 },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.textInverse, fontSize: fontSize.md, fontWeight: '700' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  modalContent: { borderRadius: borderRadius.lg, overflow: 'hidden' },
});
