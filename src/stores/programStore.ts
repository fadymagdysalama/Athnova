import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { sendNotification } from '../lib/sendNotification';
import type {
  Program,
  ProgramDay,
  ProgramExercise,
  ProgramAssignment,
  ProgramWithDays,
  ProgramDayWithExercises,
  ClientFeedback,
  CoachAssignment,
} from '../types';

interface ProgramState {
  // Coach
  myPrograms: Program[];
  // Coach: all assignments to clients (for Active tab)
  coachAssignments: CoachAssignment[];
  // Coach: offline client assignment counts per program_id
  offlineAssignmentCounts: Record<string, number>;
  // Client
  assignments: (ProgramAssignment & { program: ProgramWithDays })[];
  // Shared - currently viewed program
  currentProgram: ProgramWithDays | null;
  // Client - completed day IDs for the currently viewed program
  completedDayIds: Set<string>;

  isLoading: boolean;

  // Coach actions
  fetchMyPrograms: () => Promise<void>;
  fetchCoachAssignments: () => Promise<void>;
  createProgram: (data: {
    title: string;
    description: string;
    duration_days: number;
    type: 'private' | 'public';
    tags?: string[];
    is_coach_only?: boolean;
  }) => Promise<{ id: string | null; error: string | null }>;
  deleteProgram: (id: string) => Promise<{ error: string | null }>;
  updateProgram: (id: string, data: { title: string; description: string; is_coach_only?: boolean }) => Promise<{ error: string | null }>;
  addDay: (programId: string, dayNumber: number) => Promise<{ id: string | null; error: string | null }>;
  addExercise: (
    dayId: string,
    data: { exercise_name: string; sets: number; reps: string; rest_time: string; notes: string; video_url?: string; order_index: number; superset_group?: number | null; weight?: string | null }
  ) => Promise<{ id: string | null; error: string | null }>;
  deleteExercise: (id: string) => Promise<{ error: string | null }>;
  updateExercise: (id: string, data: { exercise_name: string; sets: number; reps: string; rest_time: string; notes: string; video_url?: string; order_index: number; superset_group?: number | null; weight?: string | null }) => Promise<{ error: string | null }>;
  assignProgram: (programId: string, clientId: string, clientVisible?: boolean) => Promise<{ error: string | null }>;
  unassignProgram: (programId: string, clientId: string) => Promise<{ error: string | null }>;
  fetchProgramAssignments: (programId: string) => Promise<{ clientId: string; clientVisible: boolean }[]>;
  updateAssignmentVisibility: (programId: string, clientId: string, clientVisible: boolean) => Promise<{ error: string | null }>;
  assignProgramToOffline: (programId: string, offlineClientId: string, clientVisible?: boolean) => Promise<{ error: string | null }>;
  unassignProgramFromOffline: (programId: string, offlineClientId: string) => Promise<{ error: string | null }>;
  fetchOfflineProgramAssignments: (programId: string) => Promise<{ clientId: string; clientVisible: boolean }[]>;
  updateOfflineAssignmentVisibility: (programId: string, offlineClientId: string, clientVisible: boolean) => Promise<{ error: string | null }>;
  duplicateProgram: (id: string) => Promise<{ id: string | null; error: string | null }>;
  reorderDay: (programId: string, dayId: string, direction: 'up' | 'down') => Promise<{ error: string | null }>;

  // Shared
  fetchProgramWithDays: (programId: string) => Promise<void>;

  // Client actions
  fetchAssignedPrograms: () => Promise<void>;
  fetchCompletedDays: (programId: string) => Promise<void>;
  logWorkout: (programId: string, dayId: string) => Promise<{ error: string | null }>;

  // Client: feedback
  submitFeedback: (programId: string, dayId: string, text: string, videoUrl?: string) => Promise<{ error: string | null }>;
  fetchProgramFeedback: (programId: string) => Promise<{ feedbacks: ClientFeedback[]; error: string | null }>;
  submitExerciseFeedback: (programId: string, dayId: string, exerciseId: string, text: string) => Promise<{ error: string | null }>;
  fetchExerciseFeedbacksForCoach: (programId: string) => Promise<{ feedbacks: any[]; error: string | null }>;
}

export const useProgramStore = create<ProgramState>((set, get) => ({
  myPrograms: [],
  coachAssignments: [],
  offlineAssignmentCounts: {},
  assignments: [],
  currentProgram: null,
  completedDayIds: new Set<string>(),
  isLoading: false,

  // ─── Coach: fetch all programs they created ───────────────────────────────
  fetchMyPrograms: async () => {
    if (!get().myPrograms.length) set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    const unique = (data ?? []).filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i);
    set({ myPrograms: unique as Program[], isLoading: false });
  },

  // ─── Coach: fetch all assignments across their programs (Active tab) ──────
  fetchCoachAssignments: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch assignments joined with program + client profile
    const { data } = await supabase
      .from('program_assignments')
      .select(`
        id,
        program_id,
        current_day,
        started_at,
        program:programs!program_assignments_program_id_fkey(
          id, title, duration_days, creator_id
        ),
        client:profiles!program_assignments_client_id_fkey(
          id, display_name, username, avatar_url, role, language, created_at
        )
      `)
      .order('started_at', { ascending: false });

    if (!data) return;

    // Keep only assignments for programs this coach owns
    const coachRows = (data as any[]).filter(
      (r) => r.program?.creator_id === user.id
    );

    // Fetch completed-day counts in one query
    const programIds = [...new Set(coachRows.map((r) => r.program_id as string))];
    const clientIds  = [...new Set(coachRows.map((r) => r.client?.id).filter((id): id is string => !!id))];

    let completedMap: Record<string, Record<string, number>> = {};
    if (programIds.length && clientIds.length) {
      const { data: logs } = await supabase
        .from('workout_logs')
        .select('program_id, client_id')
        .in('program_id', programIds)
        .in('client_id', clientIds);

      for (const log of (logs ?? []) as any[]) {
        if (!completedMap[log.client_id]) completedMap[log.client_id] = {};
        completedMap[log.client_id][log.program_id] =
          (completedMap[log.client_id][log.program_id] ?? 0) + 1;
      }
    }

    const result: CoachAssignment[] = coachRows.map((r) => ({
      assignment_id: r.id,
      program_id: r.program_id,
      program_title: r.program?.title ?? '',
      program_duration_days: r.program?.duration_days ?? 0,
      current_day: r.current_day,
      started_at: r.started_at,
      completed_days: completedMap[r.client?.id]?.[r.program_id] ?? 0,
      client: r.client,
    }));

    // Fetch offline client assignment counts per program
    const { data: offlineRows } = await supabase
      .from('offline_program_assignments')
      .select('program_id, offline_client_id')
      .eq('assigned_by', user.id);
    const offlineAssignmentCounts: Record<string, number> = {};
    for (const row of (offlineRows ?? []) as Array<{ program_id: string }>) {
      offlineAssignmentCounts[row.program_id] = (offlineAssignmentCounts[row.program_id] ?? 0) + 1;
    }

    set({ coachAssignments: result, offlineAssignmentCounts });
  },

  // ─── Coach: create a new program ─────────────────────────────────────────
  createProgram: async (data) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, error: 'Not authenticated' };

    const { data: program, error } = await supabase
      .from('programs')
      .insert({ ...data, creator_id: user.id })
      .select()
      .single();

    if (error) return { id: null, error: error.message };

    set((s) => ({ myPrograms: [program, ...s.myPrograms.filter((p) => p.id !== program.id)] }));
    return { id: program.id, error: null };
  },

  // ─── Coach: delete program ────────────────────────────────────────────────
  deleteProgram: async (id) => {
    const { error } = await supabase.from('programs').delete().eq('id', id);
    if (error) return { error: error.message };
    set((s) => ({ myPrograms: s.myPrograms.filter((p) => p.id !== id) }));
    return { error: null };
  },

  // ─── Coach: update program metadata ──────────────────────────────────────
  updateProgram: async (id, data) => {
    const { error } = await supabase.from('programs').update(data).eq('id', id);
    if (error) return { error: error.message };
    // Note: when is_coach_only changes, the DB trigger `sync_assignment_visibility`
    // automatically cascades client_visible to all program_assignments rows.
    set((s) => ({
      myPrograms: s.myPrograms.map((p) => p.id === id ? { ...p, ...data } : p),
      currentProgram: s.currentProgram?.id === id ? { ...s.currentProgram, ...data } : s.currentProgram,
    }));
    return { error: null };
  },

  // ─── Coach: add a day to a program ───────────────────────────────────────
  addDay: async (programId, dayNumber) => {
    const { data, error } = await supabase
      .from('program_days')
      .insert({ program_id: programId, day_number: dayNumber })
      .select()
      .single();

    if (error) return { id: null, error: error.message };
    return { id: data.id, error: null };
  },

  // ─── Coach: add exercise to a day ────────────────────────────────────────
  addExercise: async (dayId, data) => {
    const { data: ex, error } = await supabase
      .from('program_exercises')
      .insert({ day_id: dayId, ...data })
      .select()
      .single();

    if (error) return { id: null, error: error.message };
    return { id: ex.id, error: null };
  },

  // ─── Coach: delete exercise ───────────────────────────────────────────────
  deleteExercise: async (id) => {
    const { error } = await supabase.from('program_exercises').delete().eq('id', id);
    return { error: error?.message ?? null };
  },

  // ─── Coach: update exercise ───────────────────────────────────────────────
  updateExercise: async (id, data) => {
    const { error } = await supabase.from('program_exercises').update(data).eq('id', id);
    return { error: error?.message ?? null };
  },

  // ─── Coach: assign program to client ─────────────────────────────────────
  assignProgram: async (programId, clientId, clientVisible = true) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase.from('program_assignments').upsert(
      { program_id: programId, client_id: clientId, assigned_by: user.id, current_day: 1, client_visible: clientVisible },
      { onConflict: 'program_id,client_id' }
    );
    if (!error) {
      const program = get().myPrograms.find((p) => p.id === programId);
      sendNotification({
        recipient_id: clientId,
        type: 'program_assigned',
        title: 'New Program Assigned 📋',
        body: program
          ? `Your coach assigned you "${program.title}"`
          : 'Your coach assigned you a new program.',
        data: { program_id: programId },
      });
    }
    return { error: error?.message ?? null };
  },

  // ─── Coach: unassign program from client ─────────────────────────────────
  unassignProgram: async (programId, clientId) => {
    const { error } = await supabase
      .from('program_assignments')
      .delete()
      .eq('program_id', programId)
      .eq('client_id', clientId);
    return { error: error?.message ?? null };
  },

  // ─── Coach: get clients already assigned to a program (with visibility) ──
  fetchProgramAssignments: async (programId) => {
    const { data } = await supabase
      .from('program_assignments')
      .select('client_id, client_visible')
      .eq('program_id', programId);
    return (data ?? []).map((r: any) => ({ clientId: r.client_id, clientVisible: r.client_visible as boolean }));
  },

  // ─── Coach: update visibility of an existing online assignment ───────────
  updateAssignmentVisibility: async (programId, clientId, clientVisible) => {
    const { error } = await supabase
      .from('program_assignments')
      .update({ client_visible: clientVisible })
      .eq('program_id', programId)
      .eq('client_id', clientId);
    return { error: error?.message ?? null };
  },

  // ─── Coach: assign program to offline client ─────────────────────────────
  assignProgramToOffline: async (programId, offlineClientId, clientVisible = true) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const { error } = await supabase.from('offline_program_assignments').upsert(
      { program_id: programId, offline_client_id: offlineClientId, assigned_by: user.id, current_day: 1, client_visible: clientVisible },
      { onConflict: 'program_id,offline_client_id' }
    );
    return { error: error?.message ?? null };
  },

  // ─── Coach: unassign program from offline client ──────────────────────────
  unassignProgramFromOffline: async (programId, offlineClientId) => {
    const { error } = await supabase
      .from('offline_program_assignments')
      .delete()
      .eq('program_id', programId)
      .eq('offline_client_id', offlineClientId);
    return { error: error?.message ?? null };
  },

  // ─── Coach: get offline clients assigned to a program (with visibility) ──
  fetchOfflineProgramAssignments: async (programId) => {
    const { data } = await supabase
      .from('offline_program_assignments')
      .select('offline_client_id, client_visible')
      .eq('program_id', programId);
    return (data ?? []).map((r: any) => ({ clientId: r.offline_client_id, clientVisible: r.client_visible as boolean }));
  },

  // ─── Coach: update visibility of an existing offline assignment ───────────
  updateOfflineAssignmentVisibility: async (programId, offlineClientId, clientVisible) => {
    const { error } = await supabase
      .from('offline_program_assignments')
      .update({ client_visible: clientVisible })
      .eq('program_id', programId)
      .eq('offline_client_id', offlineClientId);
    return { error: error?.message ?? null };
  },

  // ─── Coach: duplicate a program (new id, copied days + exercises) ─────────
  duplicateProgram: async (id) => {
    // Single RPC call – all copying happens server-side in one transaction,
    // eliminating the 6+ sequential round-trips that caused the 7-second delay.
    const { data: newId, error } = await supabase.rpc('duplicate_program', { original_id: id });
    if (error || !newId) return { id: null, error: error?.message ?? 'Failed to duplicate' };

    // Fetch the newly created program so the list stays up-to-date
    const { data: newProg } = await supabase.from('programs').select('*').eq('id', newId).single();
    if (newProg) {
      set((s) => ({ myPrograms: [newProg as Program, ...s.myPrograms.filter((p) => p.id !== newProg.id)] }));
    }

    return { id: newId as string, error: null };
  },

  // ─── Coach: reorder a day up or down within a program ────────────────────
  reorderDay: async (programId, dayId, direction) => {
    const { data: days, error } = await supabase
      .from('program_days')
      .select('*')
      .eq('program_id', programId)
      .order('day_number', { ascending: true });
    if (error || !days) return { error: error?.message ?? 'Failed to fetch days' };

    const idx = days.findIndex((d: any) => d.id === dayId);
    if (idx === -1) return { error: 'Day not found' };
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= days.length) return { error: null };

    const dayA = days[idx];
    const dayB = days[swapIdx];
    const numA = dayA.day_number;
    const numB = dayB.day_number;

    // Swap day_numbers
    await supabase.from('program_days').update({ day_number: numB }).eq('id', dayA.id);
    await supabase.from('program_days').update({ day_number: numA }).eq('id', dayB.id);

    return { error: null };
  },

  // ─── Shared: load full program with days + exercises ─────────────────────
  fetchProgramWithDays: async (programId) => {
    set({ isLoading: true });

    const { data: program } = await supabase
      .from('programs')
      .select('*')
      .eq('id', programId)
      .single();

    if (!program) return set({ isLoading: false, currentProgram: null });

    const { data: days } = await supabase
      .from('program_days')
      .select('*')
      .eq('program_id', programId)
      .order('day_number', { ascending: true });

    const daysWithExercises: ProgramDayWithExercises[] = await Promise.all(
      (days ?? []).map(async (day: ProgramDay) => {
        const { data: exercises } = await supabase
          .from('program_exercises')
          .select('*')
          .eq('day_id', day.id)
          .order('order_index', { ascending: true });
        return { ...day, exercises: (exercises ?? []) as ProgramExercise[] };
      })
    );

    set({ currentProgram: { ...program, days: daysWithExercises }, isLoading: false });
  },

  // ─── Client: fetch assigned programs with full details ───────────────────
  fetchAssignedPrograms: async () => {
    if (!get().assignments.length) set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const { data: assignmentRows } = await supabase
      .from('program_assignments')
      .select('*, program:programs(*)')
      .eq('client_id', user.id)
      .eq('client_visible', true)
      .order('started_at', { ascending: false });

    if (!assignmentRows) return set({ isLoading: false, assignments: [] });

    // Filter out rows where the joined program is null (deleted / RLS blocked)
    // Also filter out programs the coach marked as coach-only reference
    const validRows = assignmentRows.filter(
      (row: any) => row.program != null && !row.program.is_coach_only
    );

    // Fetch actual completed-day counts from workout_logs
    const { data: logRows } = await supabase
      .from('workout_logs')
      .select('program_id')
      .eq('client_id', user.id);
    const logCountByProgram: Record<string, number> = {};
    for (const log of (logRows ?? []) as Array<{ program_id: string }>) {
      logCountByProgram[log.program_id] = (logCountByProgram[log.program_id] ?? 0) + 1;
    }

    // For each assignment, load days + exercises
    const enriched = await Promise.all(
      validRows.map(async (row: any) => {
        const { data: days } = await supabase
          .from('program_days')
          .select('*')
          .eq('program_id', row.program.id)
          .order('day_number', { ascending: true });

        const daysWithExercises: ProgramDayWithExercises[] = await Promise.all(
          (days ?? []).map(async (day: ProgramDay) => {
            const { data: exercises } = await supabase
              .from('program_exercises')
              .select('*')
              .eq('day_id', day.id)
              .order('order_index', { ascending: true });
            return { ...day, exercises: (exercises ?? []) as ProgramExercise[] };
          })
        );

        return {
          ...row,
          program: { ...row.program, days: daysWithExercises },
          completed_days_count: logCountByProgram[row.program_id] ?? 0,
        };
      })
    );

    set({ assignments: enriched, isLoading: false });
  },

  // ─── Client: fetch completed day IDs for a program ───────────────────────
  fetchCompletedDays: async (programId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('workout_logs')
      .select('day_id')
      .eq('client_id', user.id)
      .eq('program_id', programId);
    set({ completedDayIds: new Set((data ?? []).map((r: any) => r.day_id)) });
  },

  // ─── Client: mark a day as complete ──────────────────────────────────────
  logWorkout: async (programId, dayId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Idempotent insert – ignore duplicate
    const { error } = await supabase.from('workout_logs').upsert(
      { client_id: user.id, program_id: programId, day_id: dayId },
      { onConflict: 'client_id,program_id,day_id', ignoreDuplicates: true }
    );
    if (error) return { error: error.message };

    // Update local completed set
    const next = new Set(get().completedDayIds);
    next.add(dayId);
    set({ completedDayIds: next });

    // Advance current_day on the assignment to the next incomplete day
    const { currentProgram } = get();
    if (currentProgram) {
      const totalDays = currentProgram.days.length;
      const nextDay = currentProgram.days.find((d) => !next.has(d.id));
      const nextDayNumber = nextDay ? nextDay.day_number : totalDays;
      await supabase
        .from('program_assignments')
        .update({ current_day: nextDayNumber })
        .eq('client_id', user.id)
        .eq('program_id', programId);
    }

    return { error: null };
  },

  // ─── Client: submit or update feedback for a day ──────────────────────────────────────────
  submitFeedback: async (programId, dayId, text, videoUrl) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data: existing } = await supabase
      .from('client_feedback')
      .select('id')
      .eq('client_id', user.id)
      .eq('program_id', programId)
      .eq('day_id', dayId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('client_feedback')
        .update({ text, video_url: videoUrl ?? null })
        .eq('id', existing.id);
      return { error: error?.message ?? null };
    }

    const { error } = await supabase
      .from('client_feedback')
      .insert({ client_id: user.id, program_id: programId, day_id: dayId, text, video_url: videoUrl ?? null });
    return { error: error?.message ?? null };
  },

  // ─── Client: fetch all feedback for a program ──────────────────────────────────────────────
  fetchProgramFeedback: async (programId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { feedbacks: [], error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('client_feedback')
      .select('*')
      .eq('client_id', user.id)
      .eq('program_id', programId);

    return { feedbacks: (data ?? []) as ClientFeedback[], error: error?.message ?? null };
  },

  // ─── Client: submit exercise-level note ──────────────────────────────────
  submitExerciseFeedback: async (programId, dayId, exerciseId, text) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data: existing } = await supabase
      .from('client_feedback')
      .select('id')
      .eq('client_id', user.id)
      .eq('exercise_id', exerciseId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('client_feedback')
        .update({ text })
        .eq('id', existing.id);
      return { error: error?.message ?? null };
    }

    const { error } = await supabase
      .from('client_feedback')
      .insert({ client_id: user.id, program_id: programId, day_id: dayId, exercise_id: exerciseId, text });
    return { error: error?.message ?? null };
  },

  // ─── Coach: fetch all clients' exercise notes for a program ──────────────
  fetchExerciseFeedbacksForCoach: async (programId) => {
    const { data, error } = await supabase
      .from('client_feedback')
      .select('*, client:profiles!client_feedback_client_id_fkey(display_name)')
      .eq('program_id', programId)
      .not('exercise_id', 'is', null);
    return { feedbacks: (data ?? []) as any[], error: error?.message ?? null };
  },
}));
