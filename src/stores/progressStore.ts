import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { BodyMeasurement, ProgressPhoto, StrengthLog } from '../types';

interface ProgressState {
  measurements: BodyMeasurement[];
  strengthLogs: StrengthLog[];
  photos: ProgressPhoto[];
  isLoading: boolean;

  // Measurements
  fetchMeasurements: (clientId?: string) => Promise<void>;
  addMeasurement: (data: {
    date: string;
    weight_kg?: number | null;
    body_fat_pct?: number | null;
    muscle_mass_kg?: number | null;
    notes?: string | null;
  }) => Promise<{ error: string | null }>;
  deleteMeasurement: (id: string) => Promise<{ error: string | null }>;

  // Strength logs
  fetchStrengthLogs: (clientId?: string) => Promise<void>;
  addStrengthLog: (data: {
    exercise_name: string;
    date: string;
    weight_kg: number;
    reps: number;
    sets: number;
  }) => Promise<{ error: string | null; is_pr: boolean }>;
  deleteStrengthLog: (id: string) => Promise<{ error: string | null }>;

  // Photos
  fetchPhotos: (clientId?: string) => Promise<void>;
  uploadPhoto: (
    uri: string,
    label: 'front' | 'side' | 'back' | 'other',
    date: string,
  ) => Promise<{ error: string | null }>;
  deletePhoto: (id: string, photoUrl: string) => Promise<{ error: string | null }>;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  measurements: [],
  strengthLogs: [],
  photos: [],
  isLoading: false,

  // ─── Measurements ────────────────────────────────────────────────────────────

  fetchMeasurements: async (clientId) => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const targetId = clientId ?? user.id;
    const { data } = await supabase
      .from('body_measurements')
      .select('*')
      .eq('client_id', targetId)
      .order('date', { ascending: false });

    set({ measurements: data ?? [], isLoading: false });
  },

  addMeasurement: async (data) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data: row, error } = await supabase
      .from('body_measurements')
      .insert({ ...data, client_id: user.id })
      .select()
      .single();

    if (error) return { error: error.message };

    set((s) => ({ measurements: [row, ...s.measurements] }));
    return { error: null };
  },

  deleteMeasurement: async (id) => {
    const { error } = await supabase.from('body_measurements').delete().eq('id', id);
    if (error) return { error: error.message };
    set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) }));
    return { error: null };
  },

  // ─── Strength Logs ───────────────────────────────────────────────────────────

  fetchStrengthLogs: async (clientId) => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const targetId = clientId ?? user.id;
    const { data } = await supabase
      .from('strength_logs')
      .select('*')
      .eq('client_id', targetId)
      .order('date', { ascending: false });

    set({ strengthLogs: data ?? [], isLoading: false });
  },

  addStrengthLog: async ({ exercise_name, date, weight_kg, reps, sets }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated', is_pr: false };

    // Determine if new entry is a PR for this exercise
    const existing = get().strengthLogs.filter(
      (l) => l.exercise_name.toLowerCase() === exercise_name.toLowerCase(),
    );
    const previousMax = existing.length > 0 ? Math.max(...existing.map((l) => l.weight_kg)) : 0;
    const is_pr = weight_kg > previousMax;

    const { data: row, error } = await supabase
      .from('strength_logs')
      .insert({ client_id: user.id, exercise_name, date, weight_kg, reps, sets, is_pr })
      .select()
      .single();

    if (error) return { error: error.message, is_pr: false };

    if (is_pr && existing.some((l) => l.is_pr)) {
      // Demote previous PRs for this exercise
      await supabase
        .from('strength_logs')
        .update({ is_pr: false })
        .eq('client_id', user.id)
        .ilike('exercise_name', exercise_name)
        .eq('is_pr', true)
        .neq('id', row.id);

      set((s) => ({
        strengthLogs: [
          row,
          ...s.strengthLogs.map((l) =>
            l.exercise_name.toLowerCase() === exercise_name.toLowerCase()
              ? { ...l, is_pr: false }
              : l,
          ),
        ],
      }));
    } else {
      set((s) => ({ strengthLogs: [row, ...s.strengthLogs] }));
    }

    return { error: null, is_pr };
  },

  deleteStrengthLog: async (id) => {
    const { error } = await supabase.from('strength_logs').delete().eq('id', id);
    if (error) return { error: error.message };
    set((s) => ({ strengthLogs: s.strengthLogs.filter((l) => l.id !== id) }));
    return { error: null };
  },

  // ─── Progress Photos ─────────────────────────────────────────────────────────

  fetchPhotos: async (clientId) => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const targetId = clientId ?? user.id;
    const { data } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('client_id', targetId)
      .order('date', { ascending: false });

    set({ photos: data ?? [], isLoading: false });
  },

  uploadPhoto: async (uri, label, date) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const filename = `${user.id}/${date}_${label}_${Date.now()}.jpg`;

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from('progress-photos')
      .upload(filename, blob, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) return { error: uploadError.message };

    const { data: { publicUrl } } = supabase.storage
      .from('progress-photos')
      .getPublicUrl(filename);

    const { data: row, error } = await supabase
      .from('progress_photos')
      .insert({ client_id: user.id, date, photo_url: publicUrl, label })
      .select()
      .single();

    if (error) return { error: error.message };

    set((s) => ({ photos: [row, ...s.photos] }));
    return { error: null };
  },

  deletePhoto: async (id, photoUrl) => {
    try {
      // Extract storage path from public URL
      const marker = '/progress-photos/';
      const markerIdx = photoUrl.indexOf(marker);
      if (markerIdx !== -1) {
        const storagePath = photoUrl.slice(markerIdx + marker.length);
        await supabase.storage.from('progress-photos').remove([storagePath]);
      }
    } catch (_) {
      // Non-blocking — proceed to delete the DB row regardless
    }

    const { error } = await supabase.from('progress_photos').delete().eq('id', id);
    if (error) return { error: error.message };
    set((s) => ({ photos: s.photos.filter((p) => p.id !== id) }));
    return { error: null };
  },
}));
