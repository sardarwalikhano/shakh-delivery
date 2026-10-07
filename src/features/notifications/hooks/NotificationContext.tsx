import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { getMyNotifications, getMyUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from '../api';
import type { AppNotification } from '../types';

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [items, count] = await Promise.all([getMyNotifications(), getMyUnreadNotificationCount()]);
      setNotifications(items);
      setUnreadCount(count);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return () => { cancelled = true; };
    }

    void refresh().catch(() => {
      if (!cancelled) setLoading(false);
    });

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const nextNotification = payload.new as AppNotification;
          setNotifications((current) => [nextNotification, ...current.filter((item) => item.id !== nextNotification.id)].slice(0, 60));
          if (!nextNotification.read_at) setUnreadCount((count) => count + 1);

          void navigator.serviceWorker?.ready.then((registration) => {
            if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
            const title = nextNotification.title_ku || nextNotification.title_en;
            void registration.showNotification(title, {
              body: nextNotification.body_ku || nextNotification.body_en,
              tag: `shakh-notification-${nextNotification.id}`,
              data: { route: nextNotification.route },
              icon: '/pwa-192.png',
              badge: '/pwa-192.png',
            });
          }).catch(() => undefined);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [refresh, user]);

  const markRead = useCallback(async (id: string) => {
    const target = notifications.find((item) => item.id === id);
    if (!target || target.read_at) return;
    await markNotificationRead(id);
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
  }, [notifications]);

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    await markAllNotificationsRead();
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: now }));
    setUnreadCount(0);
  }, [unreadCount]);

  const value = useMemo<NotificationContextValue>(() => ({
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
  }), [loading, markAllRead, markRead, notifications, refresh, unreadCount]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider.');
  return context;
}
