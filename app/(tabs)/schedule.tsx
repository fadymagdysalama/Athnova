import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { isWithinNoticeWindow, isBookingClosed } from '../../src/stores/sessionStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { CalendarPicker } from '../../src/components/CalendarPicker';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';
import type { SessionWithClients } from '../../src/stores/sessionStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(time: string): string {
  const parts = time.split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parts[1] ?? '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:${minute} ${ampm}`;
}

function statusColor(status: string): string {
  if (status === 'cancelled') return colors.error;
  if (status === 'completed') return colors.success;
  return colors.primary;
}

function statusFaded(status: string): string {
  if (status === 'cancelled') return colors.errorFaded;
  if (status === 'completed') return colors.successFaded;
  return colors.accentFaded;
}

// ─── Booked Session Card ──────────────────────────────────────────────────────

function SessionCard({
  session,
  isCoach,
  onPress,
  onCancel,
  canceling,
  onDelete,
  deleting,
}: {
  session: SessionWithClients;
  isCoach: boolean;
  onPress: () => void;
  onCancel?: () => void;
  canceling?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const { t } = useTranslation();
  const sColor = statusColor(session.status);

  const allClientNames = [
    ...session.clients.map((c) => c.display_name),
    ...(session.offlineClients ?? []).map((oc) => oc.display_name),
  ];
  const subtitle = isCoach
    ? allClientNames.length > 0
      ? allClientNames.join(', ')
      : t('schedule.noParticipants')
    : '';

  // For clients: only show badge when NOT scheduled (i.e. cancelled or completed)
  const showStatusBadge = isCoach || session.status !== 'scheduled';

  const showCancelBtn = !isCoach && onCancel && session.status === 'scheduled';
  const showDeleteBtn = isCoach && onDelete && session.status === 'cancelled';

  return (
    <TouchableOpacity
      style={styles.sessionCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Left status stripe */}
      <View style={[styles.timeStripe, { backgroundColor: sColor }]} />

      {/* Card content */}
      <View style={styles.cardBody}>
        {/* Row 1: time + status badge */}
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTime}>{formatTime(session.start_time)}</Text>
          {showStatusBadge && (
            <View style={[styles.statusBadge, { backgroundColor: statusFaded(session.status) }]}>
              <Text style={[styles.statusText, { color: sColor }]}>{t(`schedule.${session.status}` as any)}</Text>
            </View>
          )}
        </View>

        {/* Row 2: duration */}
        <Text style={styles.cardMeta}>{t('schedule.min', { count: session.duration_minutes })}</Text>

        {/* Row 3: participants (coach view) */}
        {isCoach && subtitle ? (
          <Text style={styles.cardParticipants} numberOfLines={1}>{subtitle}</Text>
        ) : null}

        {/* Row 4: notes */}
        {session.notes ? (
          <Text style={styles.cardNotes} numberOfLines={1}>{session.notes}</Text>
        ) : null}

        {/* Row 5: capacity + action */}
        <View style={styles.cardBottomRow}>
          {isCoach && session.max_clients != null && (
            <View style={styles.capacityTag}>
              <Text style={styles.capacityTagText}>{(session.clients.length) + (session.offlineClients?.length ?? 0)}/{session.max_clients} clients</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {showCancelBtn && (
            <TouchableOpacity
              style={[styles.cardActionBtn, canceling && { opacity: 0.55 }]}
              onPress={onCancel}
              disabled={canceling}
              activeOpacity={0.8}
            >
              {canceling ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={[styles.cardActionBtnText, { color: colors.error }]}>{t('common.cancel')}</Text>
              )}
            </TouchableOpacity>
          )}
          {showDeleteBtn && (
            <TouchableOpacity
              style={[styles.cardActionBtn, deleting && { opacity: 0.55 }]}
              onPress={onDelete}
              disabled={deleting}
              activeOpacity={0.8}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={[styles.cardActionBtnText, { color: colors.error }]}>{t('common.delete')}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Bookable Session Card (client view) ─────────────────────────────────────

function BookableCard({
  session,
  onBook,
  booking,
}: {
  session: SessionWithClients;
  onBook: () => void;
  booking: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.bookableCard}>
      <View style={[styles.timeStripe, { backgroundColor: colors.accent }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardTime, { color: colors.accent }]}>{formatTime(session.start_time)}</Text>
        </View>
        <Text style={styles.cardMeta}>{t('schedule.min', { count: session.duration_minutes })}</Text>
        {session.notes ? (
          <Text style={styles.cardNotes} numberOfLines={1}>{session.notes}</Text>
        ) : null}
        <Text style={styles.policyNote}>
          {t('schedule.bookingClosedAt', { hours: session.booking_cutoff_hours })} · {t('schedule.cancellationClosedAt', { hours: session.cancellation_cutoff_hours })}
        </Text>
        <View style={styles.cardBottomRow}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.bookBtn, booking && styles.bookBtnDisabled]}
            onPress={onBook}
            disabled={booking}
            activeOpacity={0.8}
          >
            {booking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.bookBtnText}>{t('schedule.book')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { sessions, availableSessions, isLoading, fetchSessions, fetchAvailableCoachSessions, bookSession, cancelAsClient, deleteSession } = useSessionStore();
  const { myCoach, fetchClientData } = useConnectionStore();

  const isCoach = profile?.role === 'coach';
  const todayStr = getTodayStr();

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [refreshing, setRefreshing] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { alertProps, showAlert } = useAppAlert();

  const load = useCallback(
    (year: number, month: number) => {
      if (profile?.role) fetchSessions(year, month, profile.role);
    },
    [profile?.role, fetchSessions],
  );

  useFocusEffect(
    useCallback(() => {
      load(viewYear, viewMonth);
    }, [load, viewYear, viewMonth])
  );

  // Clients: load their coach and available sessions
  useEffect(() => {
    if (!isCoach) {
      fetchClientData();
    }
  }, [isCoach]);

  useEffect(() => {
    if (!isCoach && myCoach?.id) {
      fetchAvailableCoachSessions(myCoach.id);
    }
  }, [isCoach, myCoach?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions(viewYear, viewMonth, profile!.role);
    if (!isCoach && myCoach?.id) {
      await fetchAvailableCoachSessions(myCoach.id);
    }
    setRefreshing(false);
  };

  function prevMonth() {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  }

  async function handleBook(session: SessionWithClients) {
    // Enforce 1 active booking per day. Cancelled sessions must not block rebooking.
    const alreadyBookedToday = sessions.some(
      (s) => s.date === session.date && s.status === 'scheduled',
    );
    if (alreadyBookedToday) {
      showAlert({ title: t('common.error'), message: t('schedule.oncePerDay') });
      return;
    }

    if (isBookingClosed(session)) {
      showAlert({ title: t('common.error'), message: t('schedule.bookingClosed') });
      return;
    }

    setBookingId(session.id);
    const { error } = await bookSession(session.id);
    setBookingId(null);

    if (error) {
      const msg = error === 'already_booked' ? t('schedule.alreadyBooked') : error;
      showAlert({ title: t('common.error'), message: msg });
    }
  }

  async function handleDelete(session: SessionWithClients) {
    showAlert({
      title: t('schedule.cancelled'),
      message: t('schedule.confirmDeleteSession', { defaultValue: 'Permanently delete this cancelled session?' }),
      buttons: [
        { text: t('common.back'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeletingId(session.id);
            const { error } = await deleteSession(session.id);
            setDeletingId(null);
            if (error) showAlert({ title: t('common.error'), message: error });
          },
        },
      ],
    });
  }

  async function handleCancel(session: SessionWithClients) {
    if (isWithinNoticeWindow(session)) {
      showAlert({ title: t('schedule.cancelNotAllowed'), message: t('schedule.noticeError') });
      return;
    }
    showAlert({
      title: t('schedule.confirmLeave'),
      message: t('schedule.leaveSession'),
      buttons: [
        { text: t('common.back'), style: 'cancel' },
        {
          text: t('schedule.leaveSession'),
          style: 'destructive',
          onPress: async () => {
            setCancelingId(session.id);
            const { error } = await cancelAsClient(session.id);
            setCancelingId(null);
            if (error) {
              const message = error === 'cancel_failed' ? t('schedule.cancelBookingFailed') : error;
              showAlert({ title: t('common.error'), message });
            } else {
              // Re-fetch from DB to guarantee UI matches real state
              await fetchSessions(viewYear, viewMonth, profile!.role);
              if (myCoach?.id) await fetchAvailableCoachSessions(myCoach.id);
            }
          },
        },
      ],
    });
  }

  // Marked dates = booked sessions + available sessions (different dot types handled by CalendarPicker)
  const bookedDates = [...new Set(sessions.map((s) => s.date))];
  const availableDates = [...new Set(availableSessions.map((s) => s.date))];
  // Combine — just show a dot for any day with activity
  const markedDates = [...new Set([...bookedDates, ...availableDates])];

  // Sessions for the selected day
  const daySessions = sessions.filter((s) => s.date === selectedDate);
  const dayAvailable = availableSessions.filter((s) => s.date === selectedDate);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('schedule.title')}</Text>
        {isCoach && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() =>
              router.push({
                pathname: '/sessions/create',
                params: { initialDate: selectedDate },
              })
            }
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>＋</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* ── Calendar ── */}
        <View style={styles.calendarWrapper}>
          <CalendarPicker
            selectedDate={selectedDate}
            viewYear={viewYear}
            viewMonth={viewMonth}
            onSelectDate={setSelectedDate}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            markedDates={markedDates}
          />
        </View>

        {/* ── Day section ── */}
        <View style={styles.daySection}>
          <View style={styles.dayLabelRow}>
            <Text style={styles.dayLabel}>
              {selectedDate === todayStr ? t('schedule.today') : formatDisplayDate(selectedDate)}
            </Text>
            {selectedDate === todayStr && (
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>Today</Text>
              </View>
            )}
          </View>

          {isLoading && !refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing['2xl'] }} />
          ) : (
            <>
              {/* Booked sessions */}
              {daySessions.length === 0 && dayAvailable.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>{t('schedule.noSessions')}</Text>
                  {isCoach && (
                    <Text style={styles.emptySubtext}>{t('schedule.noSessionsSubtext')}</Text>
                  )}
                </View>
              ) : (
                daySessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isCoach={isCoach}
                    onPress={() =>
                      router.push({ pathname: '/sessions/detail', params: { sessionId: session.id } })
                    }
                    onCancel={!isCoach ? () => handleCancel(session) : undefined}
                    canceling={cancelingId === session.id}
                    onDelete={isCoach ? () => handleDelete(session) : undefined}
                    deleting={deletingId === session.id}
                  />
                ))
              )}

              {!isCoach && dayAvailable.length > 0 && (
                <View style={styles.availableSection}>
                  <Text style={styles.availableLabel}>{t('schedule.availableToBook')}</Text>
                  {dayAvailable.map((session) => (
                    <BookableCard
                      key={session.id}
                      session={session}
                      onBook={() => handleBook(session)}
                      booking={bookingId === session.id}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
      <AppAlert {...alertProps} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  addBtnText: { color: '#fff', fontSize: fontSize.xl, fontWeight: '300', lineHeight: 24 },

  // ── Scroll & calendar ───────────────────────────────────────────────────────
  scrollContent: { paddingBottom: spacing['4xl'] },
  calendarWrapper: {
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },

  // ── Day label ────────────────────────────────────────────────────────────────
  daySection: { paddingHorizontal: spacing['2xl'] },
  dayLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dayLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  todayBadge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  todayBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: '#fff' },

  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  emptySubtext: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' },

  // ── Session card ─────────────────────────────────────────────────────────────
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sessionCardInner: { flex: 1, flexDirection: 'row' },
  timeStripe: { width: 4 },

  cardBody: { flex: 1, padding: spacing.md, paddingLeft: spacing.lg },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  cardTime: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  cardMeta: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', marginBottom: spacing.xs },
  cardParticipants: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600', marginBottom: 2 },
  cardNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', marginBottom: spacing.xs },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  capacityTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  capacityTagText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  cardActionBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  cardActionBtnText: { fontSize: fontSize.xs, fontWeight: '700' },

  // ── Bookable card ─────────────────────────────────────────────────────────────
  availableSection: { marginTop: spacing.lg },
  availableLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  bookableCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  bookBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
    minWidth: 76,
  },
  bookBtnDisabled: { opacity: 0.55 },
  bookBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '800' },
  policyNote: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xs, fontStyle: 'italic' },
});
