import { supabase } from '@/lib/supabase/client';
import type { AppNotification } from './types';

export async function getMyNotifications(limit = 60): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function getMyUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_notification_read', { p_notification_id: id });
  if (error) throw error;
  return Boolean(data);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
  return Number(data ?? 0);
}
