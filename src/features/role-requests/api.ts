import { supabase } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';

export type RoleRequestStatus = 'pending' | 'approved' | 'rejected';

export type RoleRequest = {
  id: string;
  user_id?: string;
  email?: string | null;
  full_name?: string | null;
  requested_role: AppRole;
  status: RoleRequestStatus;
  requested_at: string;
  reviewed_at?: string | null;
  review_note?: string | null;
};

export async function requestRole(role: AppRole): Promise<RoleRequest> {
  const { data, error } = await supabase.rpc('request_role', { p_role: role });
  if (error) throw error;
  return data as RoleRequest;
}

export async function getMyRoleRequests(): Promise<RoleRequest[]> {
  const { data, error } = await supabase.rpc('get_my_role_requests');
  if (error) throw error;
  return (data ?? []) as RoleRequest[];
}

export async function listPendingRoleRequests(): Promise<RoleRequest[]> {
  const { data, error } = await supabase.rpc('list_pending_role_requests');
  if (error) throw error;
  return (data ?? []) as RoleRequest[];
}

export async function reviewRoleRequest(
  requestId: string,
  status: Extract<RoleRequestStatus, 'approved' | 'rejected'>,
  note?: string,
): Promise<RoleRequest> {
  const { data, error } = await supabase.rpc('review_role_request', {
    p_request_id: requestId,
    p_status: status,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return data as RoleRequest;
}
