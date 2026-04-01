import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  PublicProgram,
  ProgramPurchase,
  CoachSubscription,
  SubscriptionTier,
  ProgramDayWithExercises,
} from '../types';

interface MarketplaceState {
  publicPrograms: PublicProgram[];
  purchases: ProgramPurchase[];
  coachSubscription: CoachSubscription | null;
  isLoading: boolean;

  // Browse
  fetchPublicPrograms: (difficulty?: string) => Promise<void>;

  // Purchase checks
  fetchMyPurchases: () => Promise<void>;
  isPurchased: (programId: string) => boolean;

  // Program preview (first day only for non-buyers)
  fetchProgramPreview: (programId: string) => Promise<{
    program: PublicProgram | null;
    previewDay: ProgramDayWithExercises | null;
    error: string | null;
  }>;

  // Purchase flow (Paymob → browser payment → Supabase insert via webhook)
  // Returns paymentUrl for paid programs; app opens it in the device browser.
  purchaseProgram: (programId: string) => Promise<{ error: string | null; paymentUrl?: string }>;

  // Coach: toggle public visibility
  togglePublish: (programId: string, isPublished: boolean) => Promise<{ error: string | null }>;
  setPrice: (programId: string, price: number | null) => Promise<{ error: string | null }>;

  // Coach: subscription
  fetchCoachSubscription: () => Promise<void>;
  upgradeSubscription: (tier: SubscriptionTier) => Promise<{ error: string | null }>;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  publicPrograms: [],
  purchases: [],
  coachSubscription: null,
  isLoading: false,

  // ─── Browse public programs ───────────────────────────────────────────────
  fetchPublicPrograms: async (difficulty) => {
    set({ isLoading: true });

    let query = supabase
      .from('programs')
      .select(`
        *,
        creator:profiles!programs_creator_id_fkey(id, display_name, username)
      `)
      .eq('type', 'public')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (difficulty && difficulty !== 'all') {
      query = query.eq('difficulty', difficulty);
    }

    const { data, error } = await query;
    if (!error) {
      set({ publicPrograms: (data as PublicProgram[]) ?? [] });
    }
    set({ isLoading: false });
  },

  // ─── Fetch purchases for current user ────────────────────────────────────
  fetchMyPurchases: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('program_purchases')
      .select('*')
      .eq('client_id', user.id);

    set({ purchases: (data as ProgramPurchase[]) ?? [] });
  },

  isPurchased: (programId) => {
    return get().purchases.some((p) => p.program_id === programId);
  },

  // ─── Fetch program + preview day 1 ───────────────────────────────────────
  fetchProgramPreview: async (programId) => {
    const { data: program, error: progErr } = await supabase
      .from('programs')
      .select(`
        *,
        creator:profiles!programs_creator_id_fkey(id, display_name, username)
      `)
      .eq('id', programId)
      .eq('type', 'public')
      .eq('is_published', true)
      .single();

    if (progErr || !program) {
      return { program: null, previewDay: null, error: progErr?.message ?? 'Not found' };
    }

    // Fetch day 1 only for preview
    const { data: day1 } = await supabase
      .from('program_days')
      .select('*')
      .eq('program_id', programId)
      .eq('day_number', 1)
      .single();

    let previewDay: ProgramDayWithExercises | null = null;
    if (day1) {
      const { data: exercises } = await supabase
        .from('program_exercises')
        .select('*')
        .eq('day_id', day1.id)
        .order('order_index');

      previewDay = { ...day1, exercises: exercises ?? [] };
    }

    return { program: program as PublicProgram, previewDay, error: null };
  },

  // ─── Purchase a program ───────────────────────────────────────────────────
  // Free programs: direct insert into program_purchases.
  // Paid programs: call create-paymob-order edge function -> return paymentUrl
  //   -> app opens URL in browser -> Paymob calls paymob-webhook -> webhook inserts purchase.
  purchaseProgram: async (programId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Check program price first
    const { data: program, error: progErr } = await supabase
      .from('programs')
      .select('price')
      .eq('id', programId)
      .single();

    if (progErr || !program) return { error: 'Program not found' };

    const isFree = !program.price || program.price <= 0;

    if (isFree) {
      // Free program: insert directly
      const { error } = await supabase
        .from('program_purchases')
        .insert({ program_id: programId, client_id: user.id });

      if (error) return { error: error.message };

      const newPurchase: ProgramPurchase = {
        id: '',
        program_id: programId,
        client_id: user.id,
        purchased_at: new Date().toISOString(),
      };
      set((s) => ({ purchases: [...s.purchases, newPurchase] }));
      return { error: null };
    }

    // Paid program: get Paymob payment URL from edge function
    const { data: orderData, error: fnError } = await supabase.functions.invoke(
      'create-paymob-order',
      { body: { programId, userId: user.id } },
    );

    if (fnError) return { error: fnError.message };
    if (orderData?.error) return { error: orderData.error };

    // Return the payment URL; the screen opens it in the browser.
    // Purchase is recorded by the paymob-webhook after successful payment.
    return { error: null, paymentUrl: orderData.paymentUrl as string };
  },

  // ─── Coach: toggle publish ────────────────────────────────────────────────
  togglePublish: async (programId, isPublished) => {
    const { error } = await supabase
      .from('programs')
      .update({ is_published: isPublished })
      .eq('id', programId);

    if (error) return { error: error.message };
    return { error: null };
  },

  // ─── Coach: set price ─────────────────────────────────────────────────────
  setPrice: async (programId, price) => {
    const { error } = await supabase
      .from('programs')
      .update({ price })
      .eq('id', programId);

    if (error) return { error: error.message };
    return { error: null };
  },

  // ─── Coach: fetch own subscription ───────────────────────────────────────
  fetchCoachSubscription: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('coach_subscriptions')
      .select('*')
      .eq('coach_id', user.id)
      .maybeSingle();

    set({ coachSubscription: (data as CoachSubscription | null) });
  },

  // ─── Coach: upgrade or create subscription ────────────────────────────────
  // Tier changes are recorded directly in coach_subscriptions.
  // Paymob billing integration can be added here when recurring payments are set up.
  upgradeSubscription: async (tier) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Upsert subscription record
    const existing = get().coachSubscription;
    if (existing) {
      const { error } = await supabase
        .from('coach_subscriptions')
        .update({ tier })
        .eq('coach_id', user.id);
      if (error) return { error: error.message };
      set((s) => ({
        coachSubscription: s.coachSubscription ? { ...s.coachSubscription, tier } : null,
      }));
    } else {
      const { data, error } = await supabase
        .from('coach_subscriptions')
        .insert({ coach_id: user.id, tier })
        .select()
        .single();
      if (error) return { error: error.message };
      set({ coachSubscription: data as CoachSubscription });
    }

    return { error: null };
  },
}));
