import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { CalendarPicker } from '../../src/components/CalendarPicker';
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

// ─── Booked Session Card ──────────────────────────────────────────────────────

function SessionCard({
  session,
  isCoach,
  onPress,
  onCancel,
  canceling,
}: {
  session: SessionWithClients;
  isCoach: boolean;
  onPress: () => void;
  onCancel?: () => void;
  canceling?: boolean;
}) {
  const { t } = useTranslation();
  const sColor = statusColor(session.status);

  const subtitle = isCoach
    ? session.clients.length > 0
      ? session.clients.map((c) => c.display_name).join(', ')
      : t('schedule.noParticipants')
    : '';

  // For clients: only show badge when NOT scheduled (i.e. cancelled or completed)
  const showStatusBadge = isCoach || session.status !== 'scheduled';

  const showCancelBtn = !isCoach && onCancel && session.status === 'scheduled';

  return (
    <View style={styles.sessionCard}>
      <TouchableOpacity style={styles.sessionCardInner} onPress={onPress} activeOpacity={0.8}>
        <View style={[styles.timeStripe, { backgroundColor: sColor }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTime}>{formatTime(session.start_time)}</Text>
            {/* Capacity shown only to coach */}
            {isCoach && session.max_clients != null && (
              <View style={styles.capacityTag}>
                <Text style={styles.capacityTagText}>
                  {session.clients.length}/{session.max_clients}
                </Text>
              </View>
            )}
            {showStatusBadge && (
              <View style={[styles.statusBadge, { backgroundColor: sColor + '18' }]}>
                <Text style={[styles.statusText, { color: sColor }]}>
                  {t(`schedule.${session.status}` as any)}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.cardMeta}>{t('schedule.min', { count: session.duration_minutes })}</Text>
          {isCoach && subtitle ? (
            <Text style={styles.cardParticipants} numberOfLines={1}>{subtitle}</Text>
          ) : null}
          {session.notes ? (
            <Text style={styles.cardNotes} numberOfLines={1}>{session.notes}</Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {showCancelBtn && (
        <TouchableOpacity
          style={[styles.bookBtn, { backgroundColor: colors.error }, canceling && styles.bookBtnDisabled]}
          onPress={onCancel}
          disabled={canceling}
          activeOpacity={0.8}
        >
          {canceling ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.bookBtnText}>{t('common.cancel')}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
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
        <Text style={styles.cardTime}>{formatTime(session.start_time)}</Text>
        <Text style={styles.cardMeta}>{t('schedule.min', { count: session.duration_minutes })}</Text>
        {session.notes ? (
          <Text style={styles.cardNotes} numberOfLines={1}>{session.notes}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[styles.bookBtn, booking && styles.bookBtnDisabled]}
        onPress={onBook}
        disabled={booking}
        activeOpacity={0.8}
      >
        {booking ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text style={styles.bookBtnText}>{t('schedule.book')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { sessions, availableSessions, isLoading, fetchSessions, fetchAvailableCoachSessions, bookSession, cancelAsClient } = useSessionStore();
  const { myCoach, fetchClientData } = useConnectionStore();

  const isCoach = profile?.role === 'coach';
  const todayStr = getTodayStr();

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [refreshing, setRefreshing] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const load = useCallback(
    (year: number, month: number) => {
      if (profile?.role) fetchSessions(year, month, profile.role);
    },
    [profile?.role, fetchSessions],
  );

  useEffect(() => {
    load(viewYear, viewMonth);
  }, [viewYear, viewMonth, load]);

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
    // Enforce 1 booking per day
    const alreadyBookedToday = sessions.some((s) => s.date === session.date);
    if (alreadyBookedToday) {
      Alert.alert(t('common.error'), t('schedule.oncePerDay'));
      return;
    }

    setBookingId(session.id);
    const { error } = await bookSession(session.id);
    setBookingId(null);

    if (error) {
      const msg = error === 'already_booked' ? t('schedule.alreadyBooked') : error;
      Alert.alert(t('common.error'), msg);
    }
  }

  async function handleCancel(session: SessionWithClients) {
    Alert.alert(
      t('schedule.confirmLeave'),
      t('schedule.leaveSession'),
      [
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
              Alert.alert(t('common.error'), message);
            } else {
              // Re-fetch from DB to guarantee UI matches real state
              await fetchSessions(viewYear, viewMonth, profile!.role);
              if (myCoach?.id) await fetchAvailableCoachSessions(myCoach.id);
            }
          },
        },
      ],
    );
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
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
          <Text style={styles.dayLabel}>
            {selectedDate === todayStr
              ? t('schedule.today')
              : formatDisplayDate(selectedDate)}
          </Text>

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
                  />
                ))
              )}

              {/* Available to book (clients only, hidden when empty) */}
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
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
    fontWeight: '700',
    color: colors.text,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: colors.textInverse,
    fontSize: fontSize.lg,
    fontWeight: '700',
    lineHeight: 22,
  },

  // Scroll
  scrollContent: {
    paddingBottom: spacing['4xl'],
  },
  calendarWrapper: {
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.lg,
  },

  // Day section
  daySection: {
    paddingHorizontal: spacing['2xl'],
  },
  dayLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },

  // Empty state
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing['2xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // Booked session card
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sessionCardInner: {
    flex: 1,
    flexDirection: 'row',
  },
  timeStripe: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  cardTime: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  capacityTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.borderLight,
  },
  capacityTagText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 4,
  },
  cardParticipants: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  cardNotes: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
    fontStyle: 'italic',
  },

  // Available to book section
  availableSection: {
    marginTop: spacing.lg,
  },
  availableLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  bookableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.accent + '40',
  },
  bookBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    margin: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  bookBtnDisabled: { opacity: 0.6 },
  bookBtnText: {
    color: colors.textInverse,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  // (Cancel button reuses bookBtn/bookBtnText styles — no extra styles needed)
});

