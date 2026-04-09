import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useOfflineClientStore } from '../../src/stores/offlineClientStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { CalendarPicker } from '../../src/components/CalendarPicker';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { OfflineClient } from '../../src/types';

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

export default function CreateSessionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { initialDate } = useLocalSearchParams<{ initialDate?: string }>();
  const { createSession, createRecurringSessions } = useSessionStore();
  const { offlineClients, fetchOfflineClients } = useOfflineClientStore();
  const { clients } = useConnectionStore();
  const onGroundAppClients = clients.filter((c) => c.request?.client_mode === 'offline');

  const todayStr = getTodayStr();
  // Use the date the coach tapped in the calendar, falling back to today
  const startDate = (initialDate && initialDate >= todayStr) ? initialDate : todayStr;

  // Form state
  const [date, setDate] = useState(startDate);
  const [hourInput, setHourInput] = useState('9');
  const [minuteInput, setMinuteInput] = useState('00');
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [duration, setDuration] = useState('60');
  const [maxClients, setMaxClients] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedOfflineClientIds, setSelectedOfflineClientIds] = useState<string[]>([]);
  const [selectedAppClientIds, setSelectedAppClientIds] = useState<string[]>([]);
  const { alertProps, showAlert } = useAppAlert();
  const [bookingCutoffHours, setBookingCutoffHours] = useState(2);
  const [cancellationCutoffHours, setCancellationCutoffHours] = useState(2);

  // Date picker modal state – start the picker on the pre-selected month
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => {
    const parts = startDate.split('-');
    return parseInt(parts[0], 10);
  });
  const [pickerMonth, setPickerMonth] = useState(() => {
    const parts = startDate.split('-');
    return parseInt(parts[1], 10);
  });

  const [saving, setSaving] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(8);

  useEffect(() => {
    fetchOfflineClients();
  }, []);

  function toggleOfflineClient(id: string) {
    setSelectedOfflineClientIds((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      const maxNum = maxClients.trim() && maxClients !== '0' ? parseInt(maxClients, 10) : null;
      const totalSelected = prev.length + selectedAppClientIds.length;
      if (maxNum !== null && !isNaN(maxNum) && totalSelected >= maxNum) return prev;
      return [...prev, id];
    });
  }

  function toggleAppClient(id: string) {
    setSelectedAppClientIds((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      const maxNum = maxClients.trim() && maxClients !== '0' ? parseInt(maxClients, 10) : null;
      const totalSelected = selectedOfflineClientIds.length + prev.length;
      if (maxNum !== null && !isNaN(maxNum) && totalSelected >= maxNum) return prev;
      return [...prev, id];
    });
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
    // Reject if today and the time has already passed
    if (date === todayStr) {
      const now = new Date();
      const sessionTime = new Date();
      sessionTime.setHours(to24h(), m, 0, 0);
      if (sessionTime <= now) return t('schedule.pastTimeError');
    }
    return null;
  }

  async function handleCreate() {
    const timeError = validateTime();
    if (timeError) {
      showAlert({ title: t('common.error'), message: timeError });
      return;
    }

    const durationNum = parseInt(duration, 10);
    if (!durationNum || durationNum < 5) {
      showAlert({ title: t('common.error'), message: t('schedule.duration') + ' must be at least 5' });
      return;
    }

    const start_time = `${String(to24h()).padStart(2, '0')}:${minuteInput.padStart(2, '0')}`;

    const maxClientsNum = maxClients.trim() ? parseInt(maxClients, 10) : null;
    if (maxClientsNum !== null && (isNaN(maxClientsNum) || maxClientsNum < 1)) {
      showAlert({ title: t('common.error'), message: t('schedule.maxClients') + ' must be at least 1' });
      return;
    }

    setSaving(true);

    if (isRecurring) {
      const { count, error } = await createRecurringSessions({
        date,
        start_time,
        duration_minutes: durationNum,
        notes: notes.trim() || null,
        max_clients: maxClientsNum,
        client_ids: selectedAppClientIds,
        offline_client_ids: selectedOfflineClientIds,
        booking_cutoff_hours: bookingCutoffHours,
        cancellation_cutoff_hours: cancellationCutoffHours,
      }, recurringWeeks);
      setSaving(false);

      if (count === 0 && error) {
        showAlert({ title: t('common.error'), message: error });
        return;
      }

      showAlert({
        title: t('common.done'),
        message: t('schedule.recurringCreated', { count }),
        buttons: [{ text: 'OK', onPress: () => router.replace('/(tabs)/schedule') }],
      });
      return;
    }

    const { id, error } = await createSession({
      date,
      start_time,
      duration_minutes: durationNum,
      notes: notes.trim() || null,
      max_clients: maxClientsNum,
      client_ids: selectedAppClientIds,
      offline_client_ids: selectedOfflineClientIds,
    });
    setSaving(false);

    if (error) {
      const msg =
        error === 'overlap'
          ? t('schedule.overlapError')
          : error;
      showAlert({ title: t('common.error'), message: msg });
      return;
    }

    router.replace({
      pathname: '/sessions/detail',
      params: { sessionId: id },
    });
  }

  function pickerPrevMonth() {
    if (pickerMonth === 1) { setPickerYear((y) => y - 1); setPickerMonth(12); }
    else setPickerMonth((m) => m - 1);
  }

  function pickerNextMonth() {
    if (pickerMonth === 12) { setPickerYear((y) => y + 1); setPickerMonth(1); }
    else setPickerMonth((m) => m + 1);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('schedule.newSession')}</Text>
        <View style={{ width: 40 }} />
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
              <Text style={styles.selectFieldText}>{formatDisplayDate(date)}</Text>
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
              {/* AM / PM segmented control */}
              <View style={styles.ampmSegment}>
                {(['AM', 'PM'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.ampmOption, ampm === p && styles.ampmOptionActive]}
                    onPress={() => setAmpm(p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.ampmOptionText, ampm === p && styles.ampmOptionTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* ── Recurring ── */}
          <View style={styles.fieldGroup}>
            <View style={styles.recurringRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('schedule.recurring')}</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, isRecurring && styles.toggleActive]}
                onPress={() => setIsRecurring((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={[styles.toggleThumb, isRecurring && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>
            {isRecurring && (
              <View style={styles.recurringExpandBox}>
                <View style={styles.recurringWeeksRow}>
                  <Text style={styles.recurringWeeksLabel}>{t('schedule.recurringWeeks')}</Text>
                  <View style={styles.weeksStepper}>
                    <TouchableOpacity
                      style={styles.weeksBtn}
                      onPress={() => setRecurringWeeks((w) => Math.max(1, w - 1))}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.weeksBtnText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.weeksValueBox}>
                      <Text style={styles.weeksValue}>{recurringWeeks}</Text>
                      <Text style={styles.weeksUnit}>{t('schedule.recurringWeeksUnit')}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.weeksBtn}
                      onPress={() => setRecurringWeeks((w) => Math.min(8, w + 1))}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.weeksBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.recurringMaxHint}>{t('schedule.recurringMaxHint')}</Text>
              </View>
            )}
          </View>

          {/* ── Duration ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.duration')}</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setDuration((d) => String(Math.max(5, parseInt(d, 10) - 5)))}
                activeOpacity={0.8}
              >
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.stepperValueBox}>
                <Text style={styles.stepperValue}>{duration}</Text>
                <Text style={styles.stepperUnit}>min</Text>
              </View>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setDuration((d) => String(parseInt(d, 10) + 5))}
                activeOpacity={0.8}
              >
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.presetRow}>
              {[30, 45, 60, 90].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.presetChip, duration === String(p) && styles.presetChipActive]}
                  onPress={() => setDuration(String(p))}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.presetChipText, duration === String(p) && styles.presetChipTextActive]}>{p}m</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Max Participants ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('schedule.maxClients')}</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setMaxClients((c) => String(Math.max(0, parseInt(c || '0', 10) - 1)))}
                activeOpacity={0.8}
              >
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.stepperValueBox}>
                <Text style={styles.stepperValue}>{maxClients === '' || maxClients === '0' ? '∞' : maxClients}</Text>
                <Text style={styles.stepperUnit}>{maxClients === '' || maxClients === '0' ? 'unlimited' : 'clients'}</Text>
              </View>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setMaxClients((c) => String(parseInt(c || '0', 10) + 1))}
                activeOpacity={0.8}
              >
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
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

          {/* ── On Ground Participants ── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>On Ground Clients</Text>
            {offlineClients.length === 0 && onGroundAppClients.length === 0 ? (
              <View style={styles.emptyClients}>
                <Text style={styles.emptyClientsText}>No on ground clients yet. Add them in the Clients tab.</Text>
              </View>
            ) : (
              <>
                {onGroundAppClients.map((c) => {
                  const isSelected = selectedAppClientIds.includes(c.profile.id);
                  return (
                    <TouchableOpacity
                      key={c.profile.id}
                      style={[styles.clientRow, isSelected && styles.clientRowSelected]}
                      onPress={() => toggleAppClient(c.profile.id)}
                      activeOpacity={0.8}
                    >
                      {isSelected && <View style={styles.clientAccentBar} />}
                      <Avatar name={c.profile.display_name} size={40} />
                      <View style={styles.clientInfo}>
                        <Text style={styles.clientName}>{c.profile.display_name}</Text>
                        <View style={[styles.offlineBadge, { backgroundColor: colors.accentFaded }]}>
                          <Text style={[styles.offlineBadgeText, { color: colors.primary }]}>On Ground · App</Text>
                        </View>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {offlineClients.map((oc: OfflineClient) => {
                  const isSelected = selectedOfflineClientIds.includes(oc.id);
                  return (
                    <TouchableOpacity
                      key={oc.id}
                      style={[styles.clientRow, isSelected && styles.clientRowSelected]}
                      onPress={() => toggleOfflineClient(oc.id)}
                      activeOpacity={0.8}
                    >
                      {isSelected && <View style={styles.clientAccentBar} />}
                      <Avatar name={oc.display_name} size={40} />
                      <View style={styles.clientInfo}>
                        <Text style={styles.clientName}>{oc.display_name}</Text>
                        <View style={styles.offlineBadge}>
                          <Text style={styles.offlineBadgeText}>On Ground · No App</Text>
                        </View>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
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

          {/* ── Create button ── */}
          <TouchableOpacity
            style={[styles.createBtn, saving && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.createBtnText}>{t('schedule.createSession')}</Text>
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
              selectedDate={date}
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
      <AppAlert {...alertProps} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // ── Navbar ────────────────────────────────────────────────────────────────
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 26, color: colors.primary, fontWeight: '600', lineHeight: 30, marginLeft: -2 },
  navTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.lg,
    paddingBottom: spacing['5xl'],
  },

  // ── Field group ───────────────────────────────────────────────────────────
  fieldGroup: { marginBottom: spacing['2xl'] },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ── Inputs ────────────────────────────────────────────────────────────────
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  textarea: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.md },

  // ── Date selector ─────────────────────────────────────────────────────────
  selectField: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  selectFieldText: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 22, color: colors.accent, fontWeight: '700' },

  // ── Time row ──────────────────────────────────────────────────────────────
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeInput: { width: 70, textAlign: 'center', fontWeight: '700' },
  timeSep: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },

  // AM/PM segmented control
  ampmSegment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ampmOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 46,
    alignItems: 'center',
  },
  ampmOptionActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  ampmOptionText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  ampmOptionTextActive: { color: '#fff' },

  // ── Stepper (duration + max clients) ──────────────────────────────────────
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  stepperBtnText: { fontSize: fontSize.xl, fontWeight: '300', color: colors.primary, lineHeight: 28 },
  stepperValueBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  stepperValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  stepperUnit: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted, marginTop: 1 },

  presetRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  presetChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  presetChipActive: { backgroundColor: colors.accentFaded, borderColor: colors.accent },
  presetChipText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  presetChipTextActive: { color: colors.accent },

  // ── Clients ───────────────────────────────────────────────────────────────
  emptyClients: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  emptyClientsText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', fontWeight: '600' },

  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  clientRowSelected: { borderColor: colors.accent, backgroundColor: colors.accentFaded },
  clientAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.accent,
  },
  clientInfo: { flex: 1, marginLeft: spacing.md },
  clientName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  clientUsername: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  offlineBadge: {
    marginTop: 3,
    alignSelf: 'flex-start',
    backgroundColor: colors.warning + '22',
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  offlineBadgeText: { fontSize: 10, fontWeight: '700', color: colors.warning },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // ── Avatar ────────────────────────────────────────────────────────────────
  avatar: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800' },

  fieldHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },

  // ── Recurring toggle ──────────────────────────────────────────────────────
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recurringHintText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: colors.primary },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    alignSelf: 'flex-start',
  },
  toggleThumbActive: { alignSelf: 'flex-end' },
  recurringExpandBox: {
    marginTop: spacing.md,
    backgroundColor: colors.accentFaded,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    gap: spacing.xs,
  },
  recurringWeeksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recurringWeeksLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.accent,
  },
  weeksStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    overflow: 'hidden',
  },
  weeksBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  weeksBtnText: { fontSize: fontSize.lg, fontWeight: '300', color: colors.primary, lineHeight: 22 },
  weeksValueBox: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: spacing.md, gap: 4 },
  weeksValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  weeksUnit: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  recurringMaxHint: {
    fontSize: fontSize.xs,
    color: colors.accent,
    fontWeight: '600',
    opacity: 0.7,
  },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  createBtnDisabled: { opacity: 0.55 },
  createBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '800', letterSpacing: 0.2 },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  modalContent: { borderRadius: borderRadius.xl, overflow: 'hidden' },
});
