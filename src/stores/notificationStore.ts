import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Notification } from '../types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;

  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  /** Subscribe to real-time inserts for a user. Returns an unsubscribe function. */
  subscribeToNotifications: (userId: string) => () => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    if (!get().notifications.length) set({ isLoading: true });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ notifications: [], unreadCount: 0, isLoading: false });
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      const notifications = data as Notification[];
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.is_read).length,
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },

  markAsRead: async (id) => {
    const target = get().notifications.find((n) => n.id === id);
    if (!target || target.is_read) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n,
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllAsRead: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
  },

  clearAll: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('notifications').delete().eq('user_id', user.id);
    if (!error) {
      set({ notifications: [], unreadCount: 0 });
    }
  },

  subscribeToNotifications: (userId) => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = payload.new as Notification;
          set((s) => ({
            notifications: [incoming, ...s.notifications],
            unreadCount: s.unreadCount + 1,
          }));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },

  reset: () => set({ notifications: [], unreadCount: 0, isLoading: false }),
}));
