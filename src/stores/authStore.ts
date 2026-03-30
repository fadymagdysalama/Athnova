import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types';
import type { Session as SupabaseSession } from '@supabase/supabase-js';

interface AuthState {
  session: SupabaseSession | null;
  profile: Profile | null;
  pendingUsername: string; // username chosen at registration, before profile creation
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  signUp: (username: string, password: string) => Promise<{ error: string | null }>;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  createProfile: (username: string, displayName: string, role: UserRole) => Promise<{ error: string | null }>;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  pendingUsername: '',
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({ session });

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        set({ profile });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ session });
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          set({ profile });
        } else {
          set({ profile: null });
        }
      });
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  signUp: async (username: string, password: string) => {
    // Supabase Auth requires an email. We derive a fake email from the username.
    // The real identity is the username stored in the profiles table.
    const cleanUsername = username.toLowerCase();
    const fakeEmail = `${cleanUsername}@athnova.app`;

    const { error: signUpError } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        return { error: 'Username already taken' };
      }
      return { error: signUpError.message };
    }

    // Always sign in immediately after sign-up to guarantee a session exists
    // (signUp doesn't always return a session depending on Supabase config)
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password,
    });

    if (signInError) {
      return { error: signInError.message };
    }

    set({ session: signInData.session, pendingUsername: cleanUsername });
    return { error: null };
  },

  signIn: async (username: string, password: string) => {
    const fakeEmail = `${username.toLowerCase()}@athnova.app`;

    const { error } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password,
    });

    if (error) {
      // Show real error in dev so we can diagnose
      return { error: error.message };
    }

    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null, pendingUsername: '' });
  },

  setProfile: (profile: Profile) => {
    set({ profile });
  },

  createProfile: async (username: string, displayName: string, role: UserRole) => {
    let session = get().session;

    // If session not in store yet, fetch it directly from Supabase
    if (!session?.user) {
      const { data } = await supabase.auth.getSession();
      session = data.session;
      if (session) set({ session });
    }

    // Last resort: use getUser() which reads from the token directly
    let userId = session?.user?.id;
    if (!userId) {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id;
    }

    if (!userId) return { error: 'Not authenticated. Please try signing out and signing in again.' };

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: username.toLowerCase(),
        display_name: displayName,
        role,
        language: 'en',
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return { error: 'Username already taken' };
      }
      return { error: error.message };
    }

    set({ profile: data });
    return { error: null };
  },

  fetchProfile: async () => {
    const session = get().session;
    if (!session?.user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (data) set({ profile: data });
  },
}));
