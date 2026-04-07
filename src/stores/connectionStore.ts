import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { sendNotification } from '../lib/sendNotification';
import type { CoachClientRequest, Profile } from '../types';

interface ClientWithRequest {
  profile: Profile;
  request: CoachClientRequest;
}

interface ConnectionState {
  // Coach side
  pendingRequests: ClientWithRequest[];
  clients: ClientWithRequest[];
  // Client side
  myCoach: Profile | null;
  myRequest: CoachClientRequest | null;
  /** The mode the coach assigned this client: 'online' (full) | 'offline' (schedule only) */
  myClientMode: 'online' | 'offline' | null;

  isLoading: boolean;

  // Coach actions
  fetchCoachData: (silent?: boolean) => Promise<void>;
  acceptRequest: (requestId: string, mode?: 'online' | 'offline') => Promise<{ error: string | null }>;
  rejectRequest: (requestId: string) => Promise<{ error: string | null }>;
  removeClient: (requestId: string) => Promise<{ error: string | null }>;

  // Client actions
  fetchClientData: (silent?: boolean) => Promise<void>;
  sendRequest: (coachUsername: string) => Promise<{ error: string | null }>;
  cancelRequest: () => Promise<{ error: string | null }>;
  disconnectFromCoach: () => Promise<{ error: string | null }>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  pendingRequests: [],
  clients: [],
  myCoach: null,
  myRequest: null,
  myClientMode: null,
  isLoading: false,

  fetchCoachData: async (silent = false) => {
    if (!silent) set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const { data: requests } = await supabase
      .from('coach_client_requests')
      .select('*, client:profiles!coach_client_requests_client_id_fkey(*)')
      .eq('coach_id', user.id)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });

    const pending: ClientWithRequest[] = [];
    const accepted: ClientWithRequest[] = [];

    (requests ?? []).forEach((r: any) => {
      const item = { profile: r.client, request: r };
      if (r.status === 'pending') pending.push(item);
      else accepted.push(item);
    });

    set({ pendingRequests: pending, clients: accepted, isLoading: false });
  },

  acceptRequest: async (requestId: string, mode: 'online' | 'offline' = 'online') => {
    // Find the client before updating so we can send the notification
    const pending = get().pendingRequests.find((r) => r.request.id === requestId);

    // ─── Tier enforcement ────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const CLIENT_LIMITS: Record<string, number> = { starter: 5, pro: 15, business: Infinity };

    const { data: subData } = await supabase
      .from('coach_subscriptions')
      .select('tier')
      .eq('coach_id', user.id)
      .maybeSingle();

    const tier: string = subData?.tier ?? 'starter';
    const limit = CLIENT_LIMITS[tier] ?? 1;
    const currentClientCount = get().clients.length;

    if (currentClientCount >= limit) {
      return {
        error:
          `You've reached your ${tier} plan limit of ${limit === Infinity ? 'unlimited' : limit} client${limit === 1 ? '' : 's'}. Upgrade your plan to accept more clients.`,
      };
    }
    // ────────────────────────────────────────────────────────────────────────

    const { error } = await supabase
      .from('coach_client_requests')
      .update({ status: 'accepted', client_mode: mode })
      .eq('id', requestId);

    if (error) return { error: error.message };

    if (pending) {
      sendNotification({
        recipient_id: pending.profile.id,
        type: 'connection_accepted',
        title: 'Request Accepted! 🎉',
        body: 'Your coach accepted your connection request. You are now connected!',
        data: { request_type: 'accepted' },
      });
    }

    await get().fetchCoachData(true);

    // Auto-link: if this coach has an offline_client with matching display_name, link them
    if (pending) {
      const { data: offline } = await supabase
        .from('offline_clients')
        .select('id')
        .eq('coach_id', user.id)
        .ilike('display_name', pending.profile.display_name)
        .is('linked_profile_id', null)
        .limit(1)
        .maybeSingle();
      if (offline) {
        await supabase
          .from('offline_clients')
          .update({ linked_profile_id: pending.profile.id })
          .eq('id', offline.id);
      }
    }

    return { error: null };
  },

  rejectRequest: async (requestId: string) => {
    const pending = get().pendingRequests.find((r) => r.request.id === requestId);

    const { error } = await supabase
      .from('coach_client_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);

    if (error) return { error: error.message };

    if (pending) {
      sendNotification({
        recipient_id: pending.profile.id,
        type: 'connection_rejected',
        title: 'Request Update',
        body: 'Your coach declined your connection request.',
        data: { request_type: 'rejected' },
      });
    }

    await get().fetchCoachData(true);
    return { error: null };
  },

  removeClient: async (requestId: string) => {
    const { error } = await supabase
      .from('coach_client_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);

    if (error) return { error: error.message };
    await get().fetchCoachData(true);
    return { error: null };
  },

  fetchClientData: async (silent = false) => {
    if (!silent) set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const { data: request } = await supabase
      .from('coach_client_requests')
      .select('*, coach:profiles!coach_client_requests_coach_id_fkey(*)')
      .eq('client_id', user.id)
      .not('status', 'eq', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (request) {
      set({
        myRequest: request,
        myCoach: request.status === 'accepted' ? request.coach : null,
        myClientMode: request.status === 'accepted' ? (request.client_mode ?? 'online') : null,
        isLoading: false,
      });
    } else {
      set({ myRequest: null, myCoach: null, myClientMode: null, isLoading: false });
    }
  },

  sendRequest: async (coachUsername: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const trimmed = coachUsername.trim().toLowerCase();
    if (!trimmed) return { error: 'Please enter a coach username' };

    // Find the coach by username
    const { data: coach } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('username', trimmed)
      .single();

    if (!coach) return { error: 'Coach not found. Check the username and try again.' };
    if (coach.role !== 'coach') return { error: 'That user is not a coach.' };
    if (coach.id === user.id) return { error: 'You cannot connect with yourself.' };

    // Check for existing request — use limit(1) to handle multiple rows (e.g. repeated remove/re-add)
    const { data: existing } = await supabase
      .from('coach_client_requests')
      .select('id, status')
      .eq('coach_id', coach.id)
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'pending') return { error: 'Request already sent. Waiting for coach to respond.' };
      if (existing.status === 'accepted') return { error: 'You are already connected with this coach.' };
      // If rejected, allow re-sending by updating
      const { error } = await supabase
        .from('coach_client_requests')
        .update({ status: 'pending' })
        .eq('id', existing.id);
      if (error) return { error: error.message };
      // Notify coach of the re-sent request
      sendNotification({
        recipient_id: coach.id,
        type: 'connection_request',
        title: 'New Connection Request 🤝',
        body: 'A client wants to connect with you.',
        data: { request_type: 'new_request' },
      });
      await get().fetchClientData(true);
      return { error: null };
    }

    const { error } = await supabase
      .from('coach_client_requests')
      .insert({ coach_id: coach.id, client_id: user.id, status: 'pending' });

    if (error) return { error: error.message };

    // Notify the coach
    sendNotification({
      recipient_id: coach.id,
      type: 'connection_request',
      title: 'New Connection Request 🤝',
      body: 'A client wants to connect with you.',
      data: { request_type: 'new_request' },
    });

    await get().fetchClientData(true);
    return { error: null };
  },

  cancelRequest: async () => {
    const { myRequest } = get();
    if (!myRequest) return { error: 'No active request' };

    const { error } = await supabase
      .from('coach_client_requests')
      .delete()
      .eq('id', myRequest.id);

    if (error) return { error: error.message };
    set({ myRequest: null, myCoach: null });
    return { error: null };
  },

  disconnectFromCoach: async () => {
    const { myRequest } = get();
    if (!myRequest) return { error: 'No active connection' };

    const { error } = await supabase
      .from('coach_client_requests')
      .delete()
      .eq('id', myRequest.id);

    if (error) return { error: error.message };
    set({ myRequest: null, myCoach: null });
    return { error: null };
  },
}));
