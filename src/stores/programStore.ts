import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  Program,
  ProgramDay,
  ProgramExercise,
  ProgramAssignment,
  ProgramWithDays,
  ProgramDayWithExercises,
} from '../types';

interface ProgramState {
  // Coach
  myPrograms: Program[];
  // Client
  assignments: (ProgramAssignment & { program: ProgramWithDays })[];
  // Shared - currently viewed program
  currentProgram: ProgramWithDays | null;
  // Client - completed day IDs for the currently viewed program
  completedDayIds: Set<string>;

  isLoading: boolean;

  // Coach actions
  fetchMyPrograms: () => Promise<void>;
  createProgram: (data: {
    title: string;
    description: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    duration_days: number;
    type: 'private' | 'public';
  }) => Promise<{ id: string | null; error: string | null }>;
  deleteProgram: (id: string) => Promise<{ error: string | null }>;
  updateProgram: (id: string, data: { title: string; description: string; difficulty: 'beginner' | 'intermediate' | 'advanced' }) => Promise<{ error: string | null }>;
  addDay: (programId: string, dayNumber: number) => Promise<{ id: string | null; error: string | null }>;
  addExercise: (
    dayId: string,
    data: { exercise_name: string; sets: number; reps: string; rest_time: string; notes: string; video_url?: string; order_index: number }
  ) => Promise<{ id: string | null; error: string | null }>;
  deleteExercise: (id: string) => Promise<{ error: string | null }>;
  updateExercise: (id: string, data: { exercise_name: string; sets: number; reps: string; rest_time: string; notes: string; video_url?: string; order_index: number }) => Promise<{ error: string | null }>;
  assignProgram: (programId: string, clientId: string) => Promise<{ error: string | null }>;
  unassignProgram: (programId: string, clientId: string) => Promise<{ error: string | null }>;
  fetchProgramAssignments: (programId: string) => Promise<string[]>; // returns clientIds

  // Shared
  fetchProgramWithDays: (programId: string) => Promise<void>;

  // Client actions
  fetchAssignedPrograms: () => Promise<void>;
  fetchCompletedDays: (programId: string) => Promise<void>;
  logWorkout: (programId: string, dayId: string) => Promise<{ error: string | null }>;
}

export const useProgramStore = create<ProgramState>((set, get) => ({
  myPrograms: [],
  assignments: [],
  currentProgram: null,
  completedDayIds: new Set<string>(),
  isLoading: false,

  // ─── Coach: fetch all programs they created ───────────────────────────────
  fetchMyPrograms: async () => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    set({ myPrograms: data ?? [], isLoading: false });
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

    set((s) => ({ myPrograms: [program, ...s.myPrograms] }));
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
  assignProgram: async (programId, clientId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase.from('program_assignments').upsert(
      { program_id: programId, client_id: clientId, assigned_by: user.id, current_day: 1 },
      { onConflict: 'program_id,client_id' }
    );
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

  // ─── Coach: get clientIds already assigned to a program ──────────────────
  fetchProgramAssignments: async (programId) => {
    const { data } = await supabase
      .from('program_assignments')
      .select('client_id')
      .eq('program_id', programId);
    return (data ?? []).map((r: any) => r.client_id);
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
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const { data: assignmentRows } = await supabase
      .from('program_assignments')
      .select('*, program:programs(*)')
      .eq('client_id', user.id)
      .order('started_at', { ascending: false });

    if (!assignmentRows) return set({ isLoading: false, assignments: [] });

    // Filter out rows where the joined program is null (deleted / RLS blocked)
    const validRows = assignmentRows.filter((row: any) => row.program != null);

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
}));
