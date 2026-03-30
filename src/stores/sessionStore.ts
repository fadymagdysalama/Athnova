import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session, Profile } from '../types';

export interface SessionWithClients extends Session {
  clients: Profile[];
  coachProfile?: Profile;
}

interface CreateSessionData {
  date: string;           // 'YYYY-MM-DD'
  start_time: string;     // 'HH:MM'
  duration_minutes: number;
  notes?: string | null;
  max_clients?: number | null;
  client_ids?: string[];
}

interface UpdateSessionData {
  date?: string;
  start_time?: string;
  duration_minutes?: number;
  notes?: string | null;
  max_clients?: number | null;
}

interface SessionState {
  sessions: SessionWithClients[];
  /** Coach's future open slots the client can book into */
  availableSessions: SessionWithClients[];
  currentSession: SessionWithClients | null;
  isLoading: boolean;

  fetchSessions: (year: number, month: number, role: 'coach' | 'client') => Promise<void>;
  /** Fetch sessions from the client's coach that the client hasn't joined and that aren't full */
  fetchAvailableCoachSessions: (coachId: string) => Promise<void>;
  fetchSessionDetail: (sessionId: string) => Promise<void>;
  createSession: (data: CreateSessionData) => Promise<{ id: string | null; error: string | null }>;
  updateSession: (id: string, data: UpdateSessionData) => Promise<{ error: string | null }>;
  cancelSession: (id: string) => Promise<{ error: string | null }>;
  cancelAsClient: (sessionId: string) => Promise<{ error: string | null }>;
  /** Client books themselves into an available session */
  bookSession: (sessionId: string) => Promise<{ error: string | null }>;
  addClientToSession: (sessionId: string, clientId: string) => Promise<{ error: string | null }>;
  removeClientFromSession: (sessionId: string, clientId: string) => Promise<{ error: string | null }>;
  clearCurrentSession: () => void;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function zeroPad(n: number): string {
  return String(n).padStart(2, '0');
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  availableSessions: [],
  currentSession: null,
  isLoading: false,

  // ─── Fetch sessions for a given month ────────────────────────────────────
  fetchSessions: async (year, month, role) => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    const startDate = `${year}-${zeroPad(month)}-01`;
    const endDate   = `${year}-${zeroPad(month)}-${zeroPad(daysInMonth(year, month))}`;

    try {
      if (role === 'coach') {
        const { data, error } = await supabase
          .from('sessions')
          .select(`
            *,
            session_clients (
              id, client_id,
              profile:profiles!session_clients_client_id_fkey (
                id, display_name, username, avatar_url, role, language, created_at
              )
            )
          `)
          .eq('coach_id', user.id)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true });

        if (error) throw error;

        const sessions: SessionWithClients[] = (data ?? []).map((s: any) => ({
          ...s,
          clients: (s.session_clients ?? [])
            .map((sc: any) => sc.profile)
            .filter(Boolean),
        }));

        set({ sessions, isLoading: false });
      } else {
        // Client: first get their session IDs
        const { data: entries, error: entriesError } = await supabase
          .from('session_clients')
          .select('session_id')
          .eq('client_id', user.id);

        if (entriesError) throw entriesError;

        const sessionIds = (entries ?? []).map((e: any) => e.session_id as string);

        if (sessionIds.length === 0) return set({ sessions: [], isLoading: false });

        const { data, error } = await supabase
          .from('sessions')
          .select(`
            *,
            coach:profiles!sessions_coach_id_fkey (
              id, display_name, username, avatar_url, role, language, created_at
            )
          `)
          .in('id', sessionIds)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true });

        if (error) throw error;

        const sessions: SessionWithClients[] = (data ?? []).map((s: any) => ({
          ...s,
          clients: [],
          coachProfile: s.coach ?? undefined,
        }));

        set({ sessions, isLoading: false });
      }
    } catch (_e) {
      set({ isLoading: false });
    }
  },

  // ─── Fetch a single session with full participant details ─────────────────
  fetchSessionDetail: async (sessionId) => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return set({ isLoading: false });

    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          session_clients (
            id, client_id,
            profile:profiles!session_clients_client_id_fkey (
              id, display_name, username, avatar_url, role, language, created_at
            )
          ),
          coach:profiles!sessions_coach_id_fkey (
            id, display_name, username, avatar_url, role, language, created_at
          )
        `)
        .eq('id', sessionId)
        .single();

      if (error) throw error;

      const session: SessionWithClients = {
        ...data,
        clients: (data.session_clients ?? [])
          .map((sc: any) => sc.profile)
          .filter(Boolean),
        coachProfile: data.coach ?? undefined,
      };

      set({ currentSession: session, isLoading: false });
    } catch (_e) {
      set({ isLoading: false });
    }
  },

  // ─── Coach: create a session, optionally with initial clients ─────────────
  createSession: async ({ client_ids, ...sessionData }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, error: 'Not authenticated' };

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({ ...sessionData, coach_id: user.id })
      .select()
      .single();

    if (error) {
      if (error.message.toLowerCase().includes('overlap')) {
        return { id: null, error: 'overlap' };
      }
      return { id: null, error: error.message };
    }

    if (client_ids && client_ids.length > 0) {
      await supabase
        .from('session_clients')
        .insert(client_ids.map((clientId) => ({ session_id: session.id, client_id: clientId })));
    }

    return { id: session.id, error: null };
  },

  // ─── Coach: update session date/time/duration/notes ──────────────────────
  updateSession: async (id, data) => {
    const { error } = await supabase
      .from('sessions')
      .update(data)
      .eq('id', id);

    if (error) {
      if (error.message.toLowerCase().includes('overlap')) {
        return { error: 'overlap' };
      }
      return { error: error.message };
    }

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, ...data } : sess
      ),
      currentSession:
        s.currentSession?.id === id
          ? { ...s.currentSession, ...data }
          : s.currentSession,
    }));

    return { error: null };
  },

  // ─── Coach: cancel a session (sets status = 'cancelled') ─────────────────
  cancelSession: async (id) => {
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) return { error: error.message };

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, status: 'cancelled' } : sess
      ),
      currentSession:
        s.currentSession?.id === id
          ? { ...s.currentSession, status: 'cancelled' }
          : s.currentSession,
    }));

    return { error: null };
  },

  // ─── Client: leave a session (removes their session_clients row) ──────────
  cancelAsClient: async (sessionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { count, error } = await supabase
      .from('session_clients')
      .delete({ count: 'exact' })
      .eq('session_id', sessionId)
      .eq('client_id', user.id);

    if (error) return { error: error.message };
    // count === 0 means RLS silently blocked the delete (no rows removed)
    if (count === 0) return { error: 'cancel_failed' };

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${zeroPad(today.getMonth() + 1)}-${zeroPad(today.getDate())}`;

    set((s) => {
      const leaving = s.sessions.find((sess) => sess.id === sessionId);
      // Strip the cancelling user from the clients list
      const updated = leaving
        ? { ...leaving, clients: leaving.clients.filter((c) => c.id !== user.id) }
        : null;
      // Put it back in availableSessions if it's still scheduled and in the future
      const backAvailable =
        updated &&
        updated.status === 'scheduled' &&
        updated.date >= todayStr &&
        (updated.max_clients === null || updated.clients.length < updated.max_clients);
      return {
        sessions: s.sessions.filter((sess) => sess.id !== sessionId),
        availableSessions: backAvailable
          ? [...s.availableSessions.filter((av) => av.id !== sessionId), updated!].sort((a, b) => {
              const dateCompare = a.date.localeCompare(b.date);
              return dateCompare !== 0 ? dateCompare : a.start_time.localeCompare(b.start_time);
            })
          : s.availableSessions.filter((av) => av.id !== sessionId),
        currentSession: s.currentSession?.id === sessionId ? null : s.currentSession,
      };
    });

    return { error: null };
  },

  // ─── Coach: add a client to an existing session ───────────────────────────
  addClientToSession: async (sessionId, clientId) => {
    const { error } = await supabase
      .from('session_clients')
      .insert({ session_id: sessionId, client_id: clientId });

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        return { error: 'already_added' };
      }
      return { error: error.message };
    }

    return { error: null };
  },

  // ─── Coach: remove a client from an existing session ─────────────────────
  removeClientFromSession: async (sessionId, clientId) => {
    const { error } = await supabase
      .from('session_clients')
      .delete()
      .eq('session_id', sessionId)
      .eq('client_id', clientId);

    if (error) return { error: error.message };

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? { ...sess, clients: sess.clients.filter((c) => c.id !== clientId) }
          : sess
      ),
      currentSession:
        s.currentSession?.id === sessionId
          ? {
              ...s.currentSession,
              clients: s.currentSession.clients.filter((c) => c.id !== clientId),
            }
          : s.currentSession,
    }));

    return { error: null };
  },

  clearCurrentSession: () => set({ currentSession: null }),

  // ─── Client: fetch coach's open future sessions ───────────────────────────
  fetchAvailableCoachSessions: async (coachId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${zeroPad(today.getMonth() + 1)}-${zeroPad(today.getDate())}`;

    const { data, error } = await supabase
      .from('sessions')
      .select(`*, session_clients (id, client_id)`)
      .eq('coach_id', coachId)
      .eq('status', 'scheduled')
      .gte('date', todayStr)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) return;

    const available: SessionWithClients[] = (data ?? [])
      .filter((s: any) => {
        const clientIds: string[] = (s.session_clients ?? []).map((sc: any) => sc.client_id as string);
        if (clientIds.includes(user.id)) return false; // already booked
        if (s.max_clients !== null && clientIds.length >= s.max_clients) return false; // full
        return true;
      })
      .map((s: any) => ({
        ...s,
        clients: (s.session_clients ?? []).map((sc: any) => ({ id: sc.client_id } as Profile)),
      }));

    set({ availableSessions: available });
  },

  // ─── Client: book themselves into a session ───────────────────────────────
  bookSession: async (sessionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('session_clients')
      .insert({ session_id: sessionId, client_id: user.id });

    if (error) {
      if (error.code === '23505') return { error: 'already_booked' };
      return { error: error.message };
    }

    // Move the session from availableSessions to sessions
    set((s) => {
      const booked = s.availableSessions.find((av) => av.id === sessionId);
      return {
        availableSessions: s.availableSessions.filter((av) => av.id !== sessionId),
        sessions: booked ? [...s.sessions, booked] : s.sessions,
      };
    });

    return { error: null };
  },
}));

// ─── Helper: check if a session start is within the cancellation notice window ──
export function isWithinNoticeWindow(
  session: Session,
  noticeHours = 2,
): boolean {
  const sessionStart = new Date(`${session.date}T${session.start_time}`);
  const diffHours = (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);
  return diffHours < noticeHours;
}
