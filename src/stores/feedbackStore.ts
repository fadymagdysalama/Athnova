import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type FeedbackCategory = 'bug' | 'feature' | 'general' | 'help';

export interface AppFeedback {
  id: string;
  user_id: string;
  category: FeedbackCategory;
  subject: string;
  message: string;
  status: 'new' | 'seen' | 'resolved';
  app_version: string;
  created_at: string;
}

interface FeedbackState {
  myFeedbacks: AppFeedback[];
  isSubmitting: boolean;

  submitFeedback: (payload: {
    category: FeedbackCategory;
    subject: string;
    message: string;
  }) => Promise<{ error: string | null }>;

  fetchMyFeedbacks: () => Promise<void>;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  myFeedbacks: [],
  isSubmitting: false,

  submitFeedback: async ({ category, subject, message }) => {
    set({ isSubmitting: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ isSubmitting: false });
      return { error: 'Not authenticated' };
    }

    const { error } = await supabase.from('app_feedback').insert({
      user_id: user.id,
      category,
      subject: subject.trim(),
      message: message.trim(),
      app_version: '1.0.0',
    });

    set({ isSubmitting: false });
    return { error: error?.message ?? null };
  },

  fetchMyFeedbacks: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('app_feedback')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    set({ myFeedbacks: (data ?? []) as AppFeedback[] });
  },
}));
