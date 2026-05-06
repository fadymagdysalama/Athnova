import { create } from 'zustand';
import { invokeEdgeFunction } from '../lib/invokeEdgeFunction';
import { supabase } from '../lib/supabase';
import {
  initializeIAP,
  getSubscriptionProducts,
  purchaseSubscription,
  finishPurchase,
  shouldUseIAP,
  IAP_PRODUCT_SKUS,
} from '../lib/iap';
import type {
  PublicProgram,
  ProgramPurchase,
  CoachSubscription,
  SubscriptionTier,
  ProgramDayWithExercises,
} from '../types';

interface IAPProduct {
  productId: string;
  localizedPrice: string;
  subscriptionPeriodUnitIOS: string;
  subscriptionPeriodValueIOS: number;
}

interface MarketplaceState {
  publicPrograms: PublicProgram[];
  purchases: ProgramPurchase[];
  coachSubscription: CoachSubscription | null;
  isLoading: boolean;
  iapProducts: IAPProduct[];

  // Browse
  fetchPublicPrograms: () => Promise<void>;

  // Purchase checks
  fetchMyPurchases: () => Promise<void>;
  isPurchased: (programId: string) => boolean;

  // Program preview (first day only for non-buyers)
  fetchProgramPreview: (programId: string) => Promise<{
    program: PublicProgram | null;
    previewDay: ProgramDayWithExercises | null;
    error: string | null;
  }>;

  // Purchase flow - uses IAP on iOS, Paymob on other platforms
  purchaseProgram: (programId: string) => Promise<{ error: string | null; paymentUrl?: string }>;

  // IAP specific functions
  initializeIAPProducts: () => Promise<void>;
  getIAPProducts: () => IAPProduct[];

  // Coach: toggle public visibility
  togglePublish: (programId: string, isPublished: boolean) => Promise<{ error: string | null }>;
  setPrice: (programId: string, price: number | null) => Promise<{ error: string | null }>;

  // Coach: subscription - uses IAP on iOS, Paymob on other platforms
  fetchCoachSubscription: () => Promise<void>;
  upgradeSubscription: (tier: SubscriptionTier) => Promise<{ error: string | null; paymentUrl?: string }>;
  cancelSubscription: () => Promise<{ error: string | null }>;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  publicPrograms: [],
  purchases: [],
  coachSubscription: null,
  isLoading: false,
  iapProducts: [],

  // ─── IAP Functions ─────────────────────────────────────────────────────────
  initializeIAPProducts: async () => {
    if (!shouldUseIAP) return;
    
    try {
      await initializeIAP();
      const products = await getSubscriptionProducts();
      const mappedProducts: IAPProduct[] = products.map((p) => ({
        productId: p.id,
        localizedPrice: p.displayPrice,
        subscriptionPeriodUnitIOS: 'month',
        subscriptionPeriodValueIOS: 1,
      }));
      set({ iapProducts: mappedProducts });
    } catch (error) {
      console.error('Failed to initialize IAP products:', error);
    }
  },

  getIAPProducts: () => {
    return get().iapProducts;
  },

  // ─── Browse public programs ───────────────────────────────────────────────
  fetchPublicPrograms: async () => {
    if (!get().publicPrograms.length) set({ isLoading: true });

    const { data, error } = await supabase
      .from('programs')
      .select(`
        *,
        creator:profiles!programs_creator_id_fkey(id, display_name, username)
      `)
      .eq('type', 'public')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (!error) {
      set({ publicPrograms: (data as PublicProgram[]) ?? [], isLoading: false });
    } else {
      set({ isLoading: false });
    }
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
    const { data: orderData, error: fnError, status, responseText } = await invokeEdgeFunction<{
      paymentUrl?: string;
      error?: string;
    }>('create-paymob-order', { programId, userId: user.id });

    if (fnError) {
      console.error('create-paymob-order invoke failed:', status, responseText || fnError);
      return { error: orderData?.error ?? fnError };
    }
    if (orderData?.error) return { error: orderData.error };
    if (!orderData?.paymentUrl) return { error: 'Missing payment URL from create-paymob-order' };

    // Return the payment URL; the screen opens it in the browser.
    // Purchase is recorded by the paymob-webhook after successful payment.
    return { error: null, paymentUrl: orderData.paymentUrl };
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

    // Explicitly select only non-sensitive columns — payment_token stays server-side only
    const { data } = await supabase
      .from('coach_subscriptions')
      .select('id, coach_id, tier, payment_ref, current_period_end, created_at')
      .eq('coach_id', user.id)
      .maybeSingle();

    set({ coachSubscription: (data as CoachSubscription | null) });
  },

  // ─── Coach: upgrade or create subscription ────────────────────────────────
  // Starter tier is free — write directly to DB.
  // Pro tier: Use IAP on iOS, Paymob on Android/Web.
  upgradeSubscription: async (tier) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Starter is free — upsert directly without payment
    if (tier === 'starter') {
      const existing = get().coachSubscription;
      if (existing) {
        const { error } = await supabase
          .from('coach_subscriptions')
          .update({ tier, payment_ref: null })
          .eq('coach_id', user.id);
        if (error) return { error: error.message };
        set((s) => ({
          coachSubscription: s.coachSubscription
            ? { ...s.coachSubscription, tier, payment_ref: null }
            : null,
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
    }

    // Pro tier: Use IAP on iOS
    if (shouldUseIAP) {
      await initializeIAP();
      const products = await getSubscriptionProducts();
      
      if (products.length === 0) {
        return { error: 'No subscription products available. Please check App Store Connect.' };
      }

      // Use monthly subscription
      const product = products.find(p => p.id === IAP_PRODUCT_SKUS.MONTHLY_PRO);
      
      if (!product) {
        return { error: 'Monthly subscription product not found' };
      }
      
      const result = await purchaseSubscription(product.id);
      
      if (!result.success) {
        if (result.error === 'cancelled') {
          return { error: null }; // User cancelled, not an error
        }
        return { error: result.error || 'Purchase failed' };
      }

      // Verify receipt on backend
      try {
        const { error: fnError } = await invokeEdgeFunction<{ error?: string }>('verify-iap-subscription', {
          receipt: result.receipt,
          productId: product.id,
          userId: user.id,
        });

        if (fnError) {
          console.error('Failed to verify IAP subscription:', fnError);
        }
      } catch (verifyError) {
        console.error('Receipt verification error:', verifyError);
      }

      // Update local subscription state
      await get().fetchCoachSubscription();
      return { error: null };
    }

    // Non-iOS: Use Paymob (existing behavior)
    const { data: orderData, error: fnError, status, responseText } = await invokeEdgeFunction<{
      paymentUrl?: string;
      error?: string;
    }>('paymob-subscription', { tier });

    if (fnError) {
      console.error('paymob-subscription invoke failed:', status, responseText || fnError);
      return { error: orderData?.error ?? fnError };
    }
    if (orderData?.error) return { error: orderData.error };
    if (!orderData?.paymentUrl) return { error: 'Missing payment URL from paymob-subscription' };

    return { error: null, paymentUrl: orderData.paymentUrl };
  },

  // ─── Coach: cancel subscription (downgrade to starter immediately) ────────
  cancelSubscription: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('coach_subscriptions')
      .update({
        tier: 'starter',
        payment_ref: null,
        payment_token: null,
        current_period_end: null,
      })
      .eq('coach_id', user.id);

    if (error) return { error: error.message };

    set((s) => ({
      coachSubscription: s.coachSubscription
        ? { ...s.coachSubscription, tier: 'starter', payment_ref: null, current_period_end: null }
        : null,
    }));
    return { error: null };
  },
}));
