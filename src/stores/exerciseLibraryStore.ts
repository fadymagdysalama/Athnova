import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { ExerciseTemplate } from '../types';

interface ExerciseLibraryState {
  exercises: ExerciseTemplate[];
  customCategories: string[];
  isLoading: boolean;

  fetch: () => Promise<void>;
  add: (data: {
    name: string;
    category: string;
    video_url?: string;
    default_notes?: string;
    default_sets?: string;
    default_reps?: string;
  }) => Promise<{ error: string | null }>;
  update: (id: string, data: {
    name: string;
    category: string;
    video_url: string;
    default_notes: string;
    default_sets: string;
    default_reps: string;
  }) => Promise<{ error: string | null }>;
  remove: (id: string) => Promise<{ error: string | null }>;
  addCategory: (name: string) => Promise<{ error: string | null }>;
  removeCategory: (name: string) => Promise<{ error: string | null }>;
}

export const useExerciseLibraryStore = create<ExerciseLibraryState>((set, get) => ({
  exercises: [],
  customCategories: [],
  isLoading: false,

  fetch: async () => {
    if (!get().exercises.length) set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const [{ data: exercises }, { data: categories }] = await Promise.all([
      supabase
        .from('coach_exercise_library')
        .select('*')
        .eq('coach_id', user.id)
        .order('name', { ascending: true }),
      supabase
        .from('coach_exercise_categories')
        .select('name')
        .eq('coach_id', user.id)
        .order('name', { ascending: true }),
    ]);

    set({
      exercises: (exercises ?? []) as ExerciseTemplate[],
      customCategories: (categories ?? []).map((c: any) => c.name),
      isLoading: false,
    });
  },

  add: async ({ name, category, video_url, default_notes, default_sets, default_reps }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data: ex, error } = await supabase
      .from('coach_exercise_library')
      .insert({
        coach_id: user.id,
        name: name.trim(),
        category,
        video_url: video_url?.trim() || null,
        default_notes: default_notes?.trim() || null,
        default_sets: default_sets?.trim() || null,
        default_reps: default_reps?.trim() || null,
      })
      .select()
      .single();

    if (error) return { error: error.message };

    set((s) => ({
      exercises: [...s.exercises, ex as ExerciseTemplate].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }));
    return { error: null };
  },

  update: async (id, { name, category, video_url, default_notes, default_sets, default_reps }) => {
    const { data: updated, error } = await supabase
      .from('coach_exercise_library')
      .update({
        name: name.trim(),
        category,
        video_url: video_url.trim() || null,
        default_notes: default_notes.trim() || null,
        default_sets: default_sets.trim() || null,
        default_reps: default_reps.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return { error: error.message };

    set((s) => ({
      exercises: s.exercises
        .map((e) => (e.id === id ? (updated as ExerciseTemplate) : e))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return { error: null };
  },

  remove: async (id) => {
    const { error } = await supabase
      .from('coach_exercise_library')
      .delete()
      .eq('id', id);

    if (error) return { error: error.message };

    set((s) => ({ exercises: s.exercises.filter((e) => e.id !== id) }));
    return { error: null };
  },

  addCategory: async (name) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const trimmed = name.trim();
    const existing = get().customCategories.find(
      (c) => c.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return { error: 'Category already exists' };

    const { error } = await supabase
      .from('coach_exercise_categories')
      .insert({ coach_id: user.id, name: trimmed });

    if (error) return { error: error.message };

    set((s) => ({
      customCategories: [...s.customCategories, trimmed].sort(),
    }));
    return { error: null };
  },

  removeCategory: async (name) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Move all exercises in this category to 'other'
    const { error: moveErr } = await supabase
      .from('coach_exercise_library')
      .update({ category: 'other' })
      .eq('coach_id', user.id)
      .eq('category', name);
    if (moveErr) return { error: moveErr.message };

    const { error } = await supabase
      .from('coach_exercise_categories')
      .delete()
      .eq('coach_id', user.id)
      .eq('name', name);
    if (error) return { error: error.message };

    set((s) => ({
      customCategories: s.customCategories.filter((c) => c !== name),
      exercises: s.exercises.map((e) =>
        e.category === name ? { ...e, category: 'other' } : e
      ),
    }));
    return { error: null };
  },
}));
