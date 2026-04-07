import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/lib/supabase';
import { AppAlert, useAppAlert } from '../../src/components/AppAlert';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { Profile, OfflineClient } from '../../src/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string | null;
  restTime: string | null;
  notes: string | null;
  supersetGroup: number | null;
  weight: string | null;
}

interface AssignmentSlot {
  programId: string;
  programTitle: string;
  currentDay: number;
  totalDays: number;
  exercises: Exercise[];
  setsDone: number[]; // one count per exercise
  exerciseIndex: number;
}

interface OnlineAttendee {
  kind: 'online';
  profile: Profile;
  assignments: AssignmentSlot[];
  assignmentIndex: number;
  note: string;
}

interface OfflineAttendee {
  kind: 'offline';
  client: OfflineClient;
  assignments: AssignmentSlot[];
  assignmentIndex: number;
  note: string;
}

type Attendee = OnlineAttendee | OfflineAttendee;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function weekDayLabel(day: number): string {
  const week = Math.ceil(day / 7);
  const dayOfWeek = ((day - 1) % 7) + 1;
  return `Week ${week} · Day ${dayOfWeek}`;
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

// ─── Shared Exercise Panel ────────────────────────────────────────────────────

function ProgramPicker({
  assignments,
  selectedIndex,
  onSelect,
}: {
  assignments: AssignmentSlot[];
  selectedIndex: number;
  onSelect: (i: number) => void;
}) {
  if (assignments.length <= 1) return null;
  return (
    <View style={styles.programPickerRow}>
      {assignments.map((slot, i) => (
        <TouchableOpacity
          key={i}
          style={[styles.programPill, i === selectedIndex && styles.programPillActive]}
          onPress={() => onSelect(i)}
          activeOpacity={0.75}
        >
          <Text style={[styles.programPillText, i === selectedIndex && styles.programPillTextActive]}
            numberOfLines={1}>
            {slot.programTitle}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Exercise group building ──────────────────────────────────────────────────

interface ExGroup {
  type: 'single' | 'superset';
  letter?: string;
  exercises: Exercise[];
  indices: number[];
}

function buildExGroups(exercises: Exercise[]): ExGroup[] {
  const groups: ExGroup[] = [];
  const visitedSS = new Set<number>();
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (ex.supersetGroup === null) {
      groups.push({ type: 'single', exercises: [ex], indices: [i] });
    } else if (!visitedSS.has(ex.supersetGroup)) {
      visitedSS.add(ex.supersetGroup);
      const gExes: Exercise[] = [];
      const gIdxs: number[] = [];
      for (let j = 0; j < exercises.length; j++) {
        if (exercises[j].supersetGroup === ex.supersetGroup) {
          gExes.push(exercises[j]);
          gIdxs.push(j);
        }
      }
      groups.push({ type: 'superset', letter: String.fromCharCode(64 + ex.supersetGroup), exercises: gExes, indices: gIdxs });
    }
  }
  return groups;
}

function DoneToggle({ done, total, onToggle }: {
  done: number; total: number;
  onToggle: (sets: number) => void;
}) {
  const isDone = done >= total;
  return (
    <TouchableOpacity
      style={[styles.doneToggle, isDone && styles.doneToggleDone]}
      onPress={() => onToggle(isDone ? 0 : total)}
      activeOpacity={0.7}
    >
      {isDone && <Text style={styles.doneToggleTick}>✓</Text>}
      <Text style={[styles.doneToggleText, isDone && styles.doneToggleTextDone]}>
        {isDone ? 'Done' : 'Mark Done'}
      </Text>
    </TouchableOpacity>
  );
}

function ExerciseItem({ ex, done, onSetDone, inSuperset = false }: {
  ex: Exercise; done: number;
  onSetDone: (sets: number) => void;
  inSuperset?: boolean;
}) {
  return (
    <View style={[styles.exItem, inSuperset && styles.exItemInSuperset]}>
      <Text style={styles.exName}>{ex.name}</Text>
      <View style={styles.exMeta}>
        <Text style={styles.exMetaText}>{ex.sets} sets</Text>
        {ex.reps ? <><Text style={styles.exMetaDot}>·</Text><Text style={styles.exMetaText}>{ex.reps} reps</Text></> : null}
        {ex.weight ? <><Text style={styles.exMetaDot}>·</Text><Text style={styles.exMetaText}>{ex.weight}</Text></> : null}
        {ex.restTime ? <><Text style={styles.exMetaDot}>·</Text><Text style={styles.exMetaText}>{ex.restTime} rest</Text></> : null}
      </View>
      {ex.notes ? <Text style={styles.exNotes}>{ex.notes}</Text> : null}
      <DoneToggle done={done} total={ex.sets} onToggle={onSetDone} />
    </View>
  );
}

function ExercisePanel({
  slot,
  onSetDoneAtIndex,
  onGroupChange,
}: {
  slot: AssignmentSlot | null;
  onSetDoneAtIndex: (exIdx: number, sets: number) => void;
  onGroupChange: (groupIdx: number) => void;
}) {
  if (!slot) {
    return (
      <View style={styles.exPlaceholder}>
        <Text style={styles.exPlaceholderText}>No program assigned</Text>
      </View>
    );
  }
  const { exercises, setsDone, exerciseIndex } = slot;
  if (exercises.length === 0) {
    return (
      <View style={styles.exPlaceholder}>
        <Text style={styles.exPlaceholderText}>No exercises for today</Text>
      </View>
    );
  }

  const groups = buildExGroups(exercises);
  const totalGroups = groups.length;
  const currentGroupIdx = Math.min(exerciseIndex, totalGroups - 1);
  const group = groups[currentGroupIdx];

  // Auto-advance to next group when the last unfinished exercise in this group is marked done
  const handleSetDone = (exIdx: number, sets: number) => {
    onSetDoneAtIndex(exIdx, sets);
    if (sets > 0 && sets >= exercises[exIdx].sets && currentGroupIdx < totalGroups - 1) {
      const allOthersDone = group.indices
        .filter(i => i !== exIdx)
        .every(i => (setsDone[i] ?? 0) >= exercises[i].sets);
      if (allOthersDone) {
        setTimeout(() => onGroupChange(currentGroupIdx + 1), 350);
      }
    }
  };

  const groupDone = group.indices.every(i => (setsDone[i] ?? 0) >= exercises[i].sets);

  return (
    <View style={styles.exerciseList}>
      {/* ── Exercise Navigator ─────────────────────────────────────── */}
      {totalGroups > 1 && (
        <View style={[styles.exNavRow, groupDone && styles.exNavRowDone]}>
          <TouchableOpacity
            style={styles.exNavBtn}
            onPress={() => onGroupChange(currentGroupIdx - 1)}
            disabled={currentGroupIdx === 0}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={[styles.exNavIcon, currentGroupIdx === 0 && styles.exNavIconDisabled]}>‹</Text>
          </TouchableOpacity>
          <View style={styles.exNavCenter}>
            <Text style={styles.exNavName} numberOfLines={1}>
              {group.type === 'superset' ? `Superset ${group.letter}` : group.exercises[0].name}
            </Text>
            <Text style={styles.exNavCounter}>
              {groupDone ? '✓ done  ·  ' : ''}{currentGroupIdx + 1} / {totalGroups}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.exNavBtn}
            onPress={() => onGroupChange(currentGroupIdx + 1)}
            disabled={currentGroupIdx === totalGroups - 1}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={[styles.exNavIcon, currentGroupIdx === totalGroups - 1 && styles.exNavIconDisabled]}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Current group (single or superset) ─────────────────────── */}
      {group.type === 'superset' ? (
        <View style={styles.supersetBlock}>
          <View style={styles.supersetBlockHeader}>
            <View style={styles.supersetBlockBadge}>
              <Text style={styles.supersetBlockBadgeText}>SS-{group.letter}</Text>
            </View>
            <Text style={styles.supersetBlockTitle}>Superset {group.letter}</Text>
          </View>
          {group.exercises.map((ex, i) => (
            <ExerciseItem
              key={ex.id}
              ex={ex}
              done={setsDone[group.indices[i]] ?? 0}
              onSetDone={(sets) => handleSetDone(group.indices[i], sets)}
              inSuperset
            />
          ))}
        </View>
      ) : (
        <ExerciseItem
          ex={group.exercises[0]}
          done={setsDone[group.indices[0]] ?? 0}
          onSetDone={(sets) => handleSetDone(group.indices[0], sets)}
        />
      )}

      {/* All done banner on last group */}
      {totalGroups > 1 && currentGroupIdx === totalGroups - 1 && groupDone && (
        <View style={styles.allDoneBanner}>
          <Text style={styles.allDoneBannerText}>✓ All exercises done!</Text>
        </View>
      )}
    </View>
  );
}

// ─── Online Client Card ───────────────────────────────────────────────────────

function OnlineClientSlot({
  attendee,
  onSetDoneAtIndex,
  onNoteChange,
  onAssignmentChange,
  onGroupChange,
}: {
  attendee: OnlineAttendee;
  onSetDoneAtIndex: (exIdx: number, sets: number) => void;
  onNoteChange: (text: string) => void;
  onAssignmentChange: (index: number) => void;
  onGroupChange: (groupIdx: number) => void;
}) {
  const slot = attendee.assignments[attendee.assignmentIndex] ?? null;

  return (
    <View style={styles.clientCard}>
      <View style={styles.clientCardHeader}>
        <Avatar name={attendee.profile.display_name} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.clientCardName}>{attendee.profile.display_name}</Text>
          {slot ? (
            <Text style={styles.clientCardSub}>{slot.programTitle} · {weekDayLabel(slot.currentDay)}</Text>
          ) : (
            <Text style={styles.clientCardSub}>No program assigned</Text>
          )}
        </View>
      </View>

      <ProgramPicker
        assignments={attendee.assignments}
        selectedIndex={attendee.assignmentIndex}
        onSelect={onAssignmentChange}
      />

      <ExercisePanel slot={slot} onSetDoneAtIndex={onSetDoneAtIndex} onGroupChange={onGroupChange} />

      <TextInput
        style={styles.noteInput}
        value={attendee.note}
        onChangeText={onNoteChange}
        placeholder="Coach note (saved when session ends)..."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={2}
      />
    </View>
  );
}

// ─── Offline Client Card ──────────────────────────────────────────────────────

function OfflineClientSlot({
  attendee,
  onSetDoneAtIndex,
  onNoteChange,
  onAssignmentChange,
  onGroupChange,
}: {
  attendee: OfflineAttendee;
  onSetDoneAtIndex: (exIdx: number, sets: number) => void;
  onNoteChange: (text: string) => void;
  onAssignmentChange: (index: number) => void;
  onGroupChange: (groupIdx: number) => void;
}) {
  const slot = attendee.assignments[attendee.assignmentIndex] ?? null;

  return (
    <View style={[styles.clientCard, styles.clientCardOffline]}>
      <View style={styles.clientCardHeader}>
        <Avatar name={attendee.client.display_name} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.clientCardName}>{attendee.client.display_name}</Text>
          {slot ? (
            <Text style={styles.clientCardSub}>{slot.programTitle} · {weekDayLabel(slot.currentDay)}</Text>
          ) : (
            <View style={styles.offlinePill}>
              <Text style={styles.offlinePillText}>On Ground</Text>
            </View>
          )}
        </View>
      </View>

      <ProgramPicker
        assignments={attendee.assignments}
        selectedIndex={attendee.assignmentIndex}
        onSelect={onAssignmentChange}
      />

      <ExercisePanel slot={slot} onSetDoneAtIndex={onSetDoneAtIndex} onGroupChange={onGroupChange} />

      <TextInput
        style={styles.noteInput}
        value={attendee.note}
        onChangeText={onNoteChange}
        placeholder="Coach note (saved when session ends)..."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={2}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LiveBoardScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { fetchSessionDetail, currentSession } = useSessionStore();
  const { profile } = useAuthStore();

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const attendeesRef = React.useRef<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = React.useRef(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const sessionStatusRef = React.useRef<string | null>(null);
  const { alertProps, showAlert } = useAppAlert();

  // Redirect non-coaches away
  useEffect(() => {
    if (profile && profile.role !== 'coach') {
      router.back();
    }
  }, [profile]);

  // Auto-save logs when coach navigates back without ending the session.
  // useFocusEffect cleanup is used instead of beforeRemove because
  // beforeRemove + e.preventDefault() is not supported in native-stack.
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        if (sessionStatusRef.current === 'completed' || savingRef.current || attendeesRef.current.length === 0) return;
        const rows = buildLogRows();
        if (rows.length > 0) {
          supabase.from('live_session_logs').insert(rows);
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    load();
  }, [sessionId]);

  async function load() {
    if (!sessionId) return;
    setLoading(true);
    await fetchSessionDetail(sessionId);
    const session = useSessionStore.getState().currentSession;
    if (session) {
      setSessionStatus(session.status); sessionStatusRef.current = session.status;
      await buildAttendees(session);
    }
    setLoading(false);
  }

  // ─── Online clients: source of truth = workout_logs (count = days done) ────
  async function fetchOnlineAssignments(clientId: string): Promise<AssignmentSlot[]> {
    const { data: assignments } = await supabase
      .from('program_assignments')
      .select('program_id, programs(title, duration_days)')
      .eq('client_id', clientId)
      .order('started_at', { ascending: false });

    if (!assignments || assignments.length === 0) return [];

    return Promise.all(
      (assignments as any[]).map(async (assignment) => {
        const programTitle: string = assignment.programs?.title ?? 'Unnamed Program';
        const totalDays: number = (assignment.programs as any)?.duration_days ?? 0;

        // Count completed days from workout_logs — this is the source of truth
        const { count } = await supabase
          .from('workout_logs')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('program_id', assignment.program_id);

        const completedDays = count ?? 0;
        // Next session works on the first unmarked day
        const currentDay = totalDays > 0
          ? Math.min(completedDays + 1, totalDays)
          : completedDays + 1;

        const { data: day } = await supabase
          .from('program_days')
          .select('id')
          .eq('program_id', assignment.program_id)
          .eq('day_number', currentDay)
          .maybeSingle();

        if (!day) return { programId: assignment.program_id, programTitle, currentDay, totalDays, exercises: [], setsDone: [], exerciseIndex: 0 };

        const { data: rows } = await supabase
          .from('program_exercises')
          .select('id, exercise_name, sets, reps, rest_time, notes, superset_group, weight')
          .eq('day_id', day.id)
          .order('order_index', { ascending: true });

        const exercises: Exercise[] = (rows ?? []).map((r: any) => ({
          id: r.id,
          name: r.exercise_name,
          sets: r.sets ?? 0,
          reps: r.reps ?? null,
          restTime: r.rest_time ?? null,
          notes: r.notes ?? null,
          supersetGroup: r.superset_group ?? null,
          weight: r.weight ?? null,
        }));

        return { programId: assignment.program_id, programTitle, currentDay, totalDays, exercises, setsDone: new Array(exercises.length).fill(0), exerciseIndex: 0 } as AssignmentSlot;
      }),
    );
  }

  // ─── Offline/on-ground clients: source of truth = offline_program_assignments.current_day
  //     (they have no profile id, so no workout_logs) ────────────────────────
  async function fetchOfflineAssignments(offlineClientId: string): Promise<AssignmentSlot[]> {
    const { data: assignments } = await supabase
      .from('offline_program_assignments')
      .select('current_day, program_id, programs(title, duration_days)')
      .eq('offline_client_id', offlineClientId)
      .order('started_at', { ascending: false });

    if (!assignments || assignments.length === 0) return [];

    return Promise.all(
      (assignments as any[]).map(async (assignment) => {
        const currentDay: number = assignment.current_day ?? 1;
        const programTitle: string = assignment.programs?.title ?? 'Unnamed Program';
        const totalDays: number = (assignment.programs as any)?.duration_days ?? 0;

        const { data: day } = await supabase
          .from('program_days')
          .select('id')
          .eq('program_id', assignment.program_id)
          .eq('day_number', currentDay)
          .maybeSingle();

        if (!day) return { programId: assignment.program_id, programTitle, currentDay, totalDays, exercises: [], setsDone: [], exerciseIndex: 0 };

        const { data: rows } = await supabase
          .from('program_exercises')
          .select('id, exercise_name, sets, reps, rest_time, notes, superset_group, weight')
          .eq('day_id', day.id)
          .order('order_index', { ascending: true });

        const exercises: Exercise[] = (rows ?? []).map((r: any) => ({
          id: r.id,
          name: r.exercise_name,
          sets: r.sets ?? 0,
          reps: r.reps ?? null,
          restTime: r.rest_time ?? null,
          notes: r.notes ?? null,
          supersetGroup: r.superset_group ?? null,
          weight: r.weight ?? null,
        }));

        return { programId: assignment.program_id, programTitle, currentDay, totalDays, exercises, setsDone: new Array(exercises.length).fill(0), exerciseIndex: 0 } as AssignmentSlot;
      }),
    );
  }

  async function buildAttendees(session: NonNullable<typeof currentSession>) {
    const onlineResults = await Promise.all(
      (session.clients ?? []).map(async (p: Profile) => ({
        kind: 'online' as const,
        profile: p,
        assignments: await fetchOnlineAssignments(p.id),
        assignmentIndex: 0,
        note: '',
      })),
    );

    const offlineResults = await Promise.all(
      (session.offlineClients ?? []).map(async (oc: OfflineClient) => ({
        kind: 'offline' as const,
        client: oc,
        assignments: await fetchOfflineAssignments(oc.id),
        assignmentIndex: 0,
        note: '',
      })),
    );

    setAttendees([...onlineResults, ...offlineResults]);
    attendeesRef.current = [...onlineResults, ...offlineResults];

    // Restore cached setsDone from a previous visit to this session
    try {
      const raw = await AsyncStorage.getItem(`lb:${sessionId}`);
      if (raw) {
        const cached: { id: string; sd: number[][] }[] = JSON.parse(raw);
        setAttendees((prev) => {
          const next = prev.map((a) => {
            const id = a.kind === 'online' ? a.profile.id : a.client.id;
            const entry = cached.find((c) => c.id === id);
            if (!entry) return a;
            const assignments = a.assignments.map((slot, si) => {
              const cachedSd = entry.sd[si];
              if (!cachedSd) return slot;
              return { ...slot, setsDone: cachedSd.slice(0, slot.setsDone.length) };
            });
            return { ...a, assignments } as Attendee;
          });
          attendeesRef.current = next;
          return next;
        });
      }
    } catch { /* ignore cache read errors */ }
  }

  function updateAttendee(index: number, patch: Partial<Attendee>) {
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...prev[index], ...patch } as Attendee;
      attendeesRef.current = next;
      return next;
    });
  }

  function updateSetsDone(attendeeIndex: number, exIdx: number, sets: number) {
    setAttendees((prev) => {
      const next = [...prev];
      const a = { ...prev[attendeeIndex] };
      const assignments = [...a.assignments];
      const slot = { ...assignments[a.assignmentIndex] };
      const sd = [...slot.setsDone];
      sd[exIdx] = sets;
      slot.setsDone = sd;
      assignments[a.assignmentIndex] = slot;
      a.assignments = assignments;
      next[attendeeIndex] = a as Attendee;
      attendeesRef.current = next;
      // Persist to AsyncStorage so state survives navigating away and back
      const cacheData = next.map((att) => ({
        id: att.kind === 'online' ? att.profile.id : att.client.id,
        sd: att.assignments.map((s) => s.setsDone),
      }));
      AsyncStorage.setItem(`lb:${sessionId}`, JSON.stringify(cacheData));
      return next;
    });
  }

  function updateExerciseIndex(attendeeIndex: number, exIdx: number) {
    setAttendees((prev) => {
      const next = [...prev];
      const a = { ...prev[attendeeIndex] };
      const assignments = [...a.assignments];
      const slot = { ...assignments[a.assignmentIndex], exerciseIndex: exIdx };
      assignments[a.assignmentIndex] = slot;
      a.assignments = assignments;
      next[attendeeIndex] = a as Attendee;
      return next;
    });
  }

  function updateAssignmentIndex(attendeeIndex: number, assignmentIndex: number) {
    setAttendees((prev) => {
      const next = [...prev];
      next[attendeeIndex] = { ...prev[attendeeIndex], assignmentIndex } as Attendee;
      return next;
    });
  }

  async function completeSession(): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = [];
    const current = attendeesRef.current;

    // 1. Mark session as completed
    const { error: sessErr } = await supabase
      .from('sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId);
    if (sessErr) return { ok: false, errors: ['Could not complete session: ' + sessErr.message] };

    // 2. Online clients: log the current day in workout_logs
    //    workout_logs IS the source of truth — client-progress reads from here.
    //    Next time live board loads, it will count logs and show the next unmarked day.
    //    Also: on-ground clients who have the app are OnlineAttendees but their packages
    //    live in offline_client_packages (linked via offline_clients.linked_profile_id),
    //    so we increment their active package here too.
    await Promise.allSettled(
      current
        .filter((a): a is OnlineAttendee => a.kind === 'online')
        .map(async (attendee) => {
          const slot = attendee.assignments[attendee.assignmentIndex];
          if (slot) {
            const { data: dayRow } = await supabase
              .from('program_days')
              .select('id')
              .eq('program_id', slot.programId)
              .eq('day_number', slot.currentDay)
              .maybeSingle();

            if (dayRow) {
              // ON CONFLICT DO NOTHING — safe to call even if already logged
              const { error: wlErr } = await supabase.from('workout_logs').upsert(
                { client_id: attendee.profile.id, program_id: slot.programId, day_id: dayRow.id },
                { onConflict: 'client_id,program_id,day_id', ignoreDuplicates: true },
              );
              if (wlErr) errors.push(`Progress error (${attendee.profile.display_name}): ${wlErr.message}`);
            }
          }

          // Check if this app-user is also an on-ground client (linked_profile_id match)
          // and increment their active package if so.
          const { data: linkedOffline } = await supabase
            .from('offline_clients')
            .select('id')
            .eq('linked_profile_id', attendee.profile.id)
            .maybeSingle();
          if (!linkedOffline) return;

          const { data: pkg, error: pkgReadErr } = await supabase
            .from('offline_client_packages')
            .select('id, total_sessions, sessions_used')
            .eq('offline_client_id', linkedOffline.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (pkgReadErr) { errors.push(`Package read error (${attendee.profile.display_name}): ${pkgReadErr.message}`); return; }
          if (!pkg) return;
          const newUsed = Math.min(pkg.total_sessions, (pkg.sessions_used ?? 0) + 1);
          const newStatus = newUsed >= pkg.total_sessions ? 'completed' : 'active';
          const { error: pkgUpdateErr } = await supabase
            .from('offline_client_packages')
            .update({ sessions_used: newUsed, status: newStatus })
            .eq('id', pkg.id);
          if (pkgUpdateErr) errors.push(`Package error (${attendee.profile.display_name}): ${pkgUpdateErr.message}`);
        }),
    );

    // 3. Offline/on-ground clients: advance current_day (their source of truth)
    //    and increment their active package counter.
    await Promise.allSettled(
      current
        .filter((a): a is OfflineAttendee => a.kind === 'offline')
        .map(async (a) => {
          // Advance program day if the client has a program assigned
          const slot = a.assignments[a.assignmentIndex];
          if (slot) {
            const nextDay =
              slot.totalDays > 0 && slot.currentDay >= slot.totalDays
                ? slot.currentDay
                : slot.currentDay + 1;

            const { error: opaErr } = await supabase
              .from('offline_program_assignments')
              .update({ current_day: nextDay })
              .eq('program_id', slot.programId)
              .eq('offline_client_id', a.client.id);
            if (opaErr) errors.push(`Progress error (${a.client.display_name}): ${opaErr.message}`);
          }

          // Always increment sessions_used on their active package (if any),
          // regardless of whether they have a program assigned.
          const { data: pkg, error: pkgReadErr } = await supabase
            .from('offline_client_packages')
            .select('id, total_sessions, sessions_used')
            .eq('offline_client_id', a.client.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (pkgReadErr) { errors.push(`Package read error (${a.client.display_name}): ${pkgReadErr.message}`); return; }
          if (!pkg) return;
          const newUsed = Math.min(pkg.total_sessions, (pkg.sessions_used ?? 0) + 1);
          const newStatus = newUsed >= pkg.total_sessions ? 'completed' : 'active';
          const { error: pkgUpdateErr } = await supabase
            .from('offline_client_packages')
            .update({ sessions_used: newUsed, status: newStatus })
            .eq('id', pkg.id);
          if (pkgUpdateErr) errors.push(`Package error (${a.client.display_name}): ${pkgUpdateErr.message}`);
        }),
    );

    // Save coach notes to the sessions table so they appear in session history
    const sessionNote = current.map(a => a.note.trim()).filter(Boolean).join('\n\n');
    if (sessionNote) {
      await supabase.from('sessions').update({ notes: sessionNote }).eq('id', sessionId);
    }

    return { ok: true, errors };
  }

  function buildLogRows(): object[] {
    const rows: object[] = [];
    for (const attendee of attendeesRef.current) {
      const base = attendee.kind === 'online'
        ? { client_id: attendee.profile.id, offline_client_id: null }
        : { client_id: null, offline_client_id: attendee.client.id };

      // Log sets for every program/assignment (coach may have recorded across programs)
      for (const slot of attendee.assignments) {
        slot.exercises.forEach((ex, idx) => {
          const setsDone = slot.setsDone[idx] ?? 0;
          if (setsDone > 0) {
            rows.push({ session_id: sessionId, ...base, exercise_id: ex.id, exercise_name: ex.name, sets_done: setsDone });
          }
        });
      }

      if (attendee.note.trim()) {
        rows.push({ session_id: sessionId, ...base, exercise_name: 'Coach Note', sets_done: 0, coach_notes: attendee.note.trim() });
      }
    }
    return rows;
  }

  async function saveLogs(): Promise<boolean> {
    const rows = buildLogRows();
    if (rows.length === 0) return true;
    const { error } = await supabase.from('live_session_logs').insert(rows);
    return !error;
  }

  function handleEndSession() {
    showAlert({
      title: 'End Session',
      message: 'Save all workout data and mark this session as complete?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          onPress: async () => {
            setSaving(true); savingRef.current = true;
            await saveLogs();
            const { ok, errors } = await completeSession();
            setSaving(false); savingRef.current = false;
            if (!ok) {
              showAlert({ title: 'Error', message: errors[0] ?? 'Session could not be completed.' });
              return;
            }
            setSessionStatus('completed'); sessionStatusRef.current = 'completed';
            showAlert({
              title: 'Session Complete',
              message: errors.length > 0
                ? `Session marked complete. Note: ${errors.join(' | ')}`
                : 'Great work! Session has been marked as completed.',
              buttons: [{ text: 'Done', onPress: () => router.back() }],
            });
          },
        },
      ],
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Live Board</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Navbar ── */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Live Board</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Client cards ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {attendees.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No clients in this session.</Text>
            </View>
          )}

          {attendees.map((attendee, idx) => {
            const slot = attendee.assignments[attendee.assignmentIndex];
            if (attendee.kind === 'online') {
              return (
                <OnlineClientSlot
                  key={attendee.profile.id}
                  attendee={attendee}
                  onSetDoneAtIndex={(exIdx, sets) => updateSetsDone(idx, exIdx, sets)}
                  onNoteChange={(text) =>
                    updateAttendee(idx, { note: text } as Partial<OnlineAttendee>)
                  }
                  onAssignmentChange={(aIdx) => updateAssignmentIndex(idx, aIdx)}
                  onGroupChange={(gIdx) => updateExerciseIndex(idx, gIdx)}
                />
              );
            }
            return (
              <OfflineClientSlot
                key={attendee.client.id}
                attendee={attendee}
                onSetDoneAtIndex={(exIdx, sets) => updateSetsDone(idx, exIdx, sets)}
                onNoteChange={(text) =>
                  updateAttendee(idx, { note: text } as Partial<OfflineAttendee>)
                }
                onAssignmentChange={(aIdx) => updateAssignmentIndex(idx, aIdx)}
                onGroupChange={(gIdx) => updateExerciseIndex(idx, gIdx)}
              />
            );
          })}

          {/* ── Complete button ── */}
          {sessionStatus !== 'completed' ? (
            <TouchableOpacity
              style={[styles.completeBtn, saving && styles.completeBtnDisabled]}
              onPress={handleEndSession}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.completeBtnText}>End Session</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.completedBanner}>
              <Text style={styles.completedBannerText}>Session Completed — View Only</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <AppAlert {...alertProps} />
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
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['5xl'],
  },

  clientCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
  },
  clientCardOffline: { borderColor: colors.warning + '44' },
  clientCardHeader: { flexDirection: 'row', alignItems: 'center' },
  clientCardName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  clientCardSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  avatar: {
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '700' },

  exBlock: { gap: spacing.xs },
  exName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  exMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  exMetaText: { fontSize: fontSize.sm, color: colors.textSecondary },
  exMetaDot: { fontSize: fontSize.sm, color: colors.textMuted },
  exNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  exPlaceholder: {
    backgroundColor: colors.success + '12',
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  exPlaceholderText: { fontSize: fontSize.sm, color: colors.success, fontWeight: '600' },

  // Exercise navigator
  exNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  exNavRowDone: { borderColor: colors.success + '55', backgroundColor: colors.successFaded },
  exNavBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  exNavIcon: { fontSize: 28, color: colors.primary, fontWeight: '500', lineHeight: 32 },
  exNavIconDisabled: { color: colors.borderLight },
  exNavCenter: { flex: 1, alignItems: 'center', gap: 1 },
  exNavName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  exNavCounter: { fontSize: 11, fontWeight: '600', color: colors.textMuted },

  allDoneBanner: {
    backgroundColor: colors.successFaded,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  allDoneBannerText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.success },

  // Exercise list (new list-based design)
  exerciseList: { gap: spacing.sm },
  exItem: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  exItemInSuperset: {
    borderColor: 'transparent',
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning + '30',
  },

  // Superset block
  supersetBlock: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.warning + '55',
    overflow: 'hidden',
  },
  supersetBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warning + '14',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  supersetBlockBadge: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  supersetBlockBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  supersetBlockTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.warning },

  // Set counter styles no longer used; keeping doneToggle styles below
  doneToggle: {
    marginTop: spacing.xs,
    paddingVertical: 9,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  doneToggleDone: {
    backgroundColor: colors.successFaded,
    borderColor: colors.success,
  },
  doneToggleTick: { fontSize: 13, fontWeight: '800', color: colors.success },
  doneToggleText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  doneToggleTextDone: { color: colors.success },

  // Program picker
  programPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  programPill: {
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.background,
    maxWidth: 180,
  },
  programPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  programPillText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
  },
  programPillTextActive: {
    color: '#fff',
  },

  noteInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlignVertical: 'top',
  },

  offlinePill: {
    marginTop: 3,
    alignSelf: 'flex-start',
    backgroundColor: colors.warning + '22',
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  offlinePillText: { fontSize: 10, fontWeight: '700', color: colors.warning },

  emptyState: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyStateText: { fontSize: fontSize.md, color: colors.textMuted },

  completeBtn: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '800', letterSpacing: 0.2 },

  completedBanner: {
    backgroundColor: colors.successFaded,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  completedBannerText: { color: colors.success, fontSize: fontSize.sm, fontWeight: '700' },
});
