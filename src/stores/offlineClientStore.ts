import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { OfflineClient } from '../types';

interface OfflineClientState {
  offlineClients: OfflineClient[];
  isLoading: boolean;

  fetchOfflineClients: () => Promise<void>;
  addOfflineClient: (data: { display_name: string; phone?: string; notes?: string }) => Promise<{ id: string | null; error: string | null }>;
  updateOfflineClient: (id: string, data: { display_name?: string; phone?: string; notes?: string }) => Promise<{ error: string | null }>;
  deleteOfflineClient: (id: string) => Promise<{ error: string | null }>;
}

export const useOfflineClientStore = create<OfflineClientState>((set, get) => ({
  offlineClients: [],
  isLoading: false,

  fetchOfflineClients: async () => {
    if (!get().offlineClients.length) set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const { data, error } = await supabase
      .from('offline_clients')
      .select('*')
      .eq('coach_id', user.id)
      .is('linked_profile_id', null)
      .order('display_name', { ascending: true });

    set({ offlineClients: error ? [] : (data as OfflineClient[]), isLoading: false });
  },

  addOfflineClient: async ({ display_name, phone, notes }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, error: 'Not authenticated' };

    // ─── Tier enforcement ────────────────────────────────────────────────
    const OFFLINE_LIMITS: Record<string, number> = { starter: 10, pro: Infinity };
    const { data: subData } = await supabase
      .from('coach_subscriptions')
      .select('tier')
      .eq('coach_id', user.id)
      .maybeSingle();
    const tier: string = subData?.tier ?? 'starter';
    const limit = OFFLINE_LIMITS[tier] ?? 10;

    // Total on-ground = pure walkup clients + app clients already in offline mode
    const [walkupCount, { data: appOfflineRows }] = await Promise.all([
      Promise.resolve(get().offlineClients.length),
      supabase
        .from('coach_client_requests')
        .select('id')
        .eq('coach_id', user.id)
        .eq('status', 'accepted')
        .eq('client_mode', 'offline'),
    ]);
    const totalOnGround = walkupCount + (appOfflineRows ?? []).length;
    if (totalOnGround >= limit) {
      return { id: null, error: `You've reached your ${tier} plan limit of ${limit} on-ground client${limit === 1 ? '' : 's'}. Upgrade to Pro for unlimited clients.` };
    }
    // ─────────────────────────────────────────────────────────────────────

    const { data, error } = await supabase
      .from('offline_clients')
      .insert({ coach_id: user.id, display_name: display_name.trim(), phone: phone?.trim() || null, notes: notes?.trim() || null })
      .select()
      .single();

    if (error) return { id: null, error: error.message };

    set((s) => ({ offlineClients: [...s.offlineClients, data as OfflineClient].sort((a, b) => a.display_name.localeCompare(b.display_name)) }));
    return { id: (data as OfflineClient).id, error: null };
  },

  updateOfflineClient: async (id, data) => {
    const { error } = await supabase
      .from('offline_clients')
      .update(data)
      .eq('id', id);

    if (error) return { error: error.message };

    set((s) => ({
      offlineClients: s.offlineClients
        .map((c) => c.id === id ? { ...c, ...data } : c)
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    }));
    return { error: null };
  },

  deleteOfflineClient: async (id) => {
    const { error } = await supabase
      .from('offline_clients')
      .delete()
      .eq('id', id);

    if (error) return { error: error.message };

    set((s) => ({ offlineClients: s.offlineClients.filter((c) => c.id !== id) }));
    return { error: null };
  },
}));
