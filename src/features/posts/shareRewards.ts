import { supabase } from '@/lib/supabase/client';

export type ShareEarning = {
  id: string;
  post_id: string | null;
  post_title: string;
  order_type: 'food_post' | 'apparel_post';
  order_number: string;
  amount_iqd: number;
  created_at: string;
};

export type ShareWalletTransaction = {
  id: string;
  transaction_type: 'earning' | 'withdrawal_reserved' | 'withdrawal_refund' | 'platform_spend' | 'platform_spend_refund';
  amount_iqd: number;
  balance_after_iqd: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string;
  created_at: string;
};

export type ShareWithdrawal = {
  id: string;
  amount_iqd: number;
  payment_method: string;
  recipient_name: string;
  recipient_account: string | null;
  recipient_phone: string | null;
  status: 'pending' | 'paid' | 'rejected';
  admin_note: string | null;
  payout_reference: string | null;
  requested_at: string;
  reviewed_at: string | null;
};

export type ShareRewardsSummary = {
  balance_iqd: number;
  lifetime_earned_iqd: number;
  lifetime_withdrawn_iqd: number;
  lifetime_spent_iqd: number;
  this_month_earned_iqd: number;
  current_month: string;
  earnings: ShareEarning[];
  transactions: ShareWalletTransaction[];
  withdrawals: ShareWithdrawal[];
};

export type PendingShareWithdrawal = ShareWithdrawal & {
  user_id: string;
  user_email?: string | null;
};

export async function createPostShareLink(postId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_post_share_link', { p_post_id: postId });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('نەتوانرا لینکی شێرکردن دروست بکرێت.');
  return data;
}

export async function getShareRewardsSummary(): Promise<ShareRewardsSummary> {
  const { data, error } = await supabase.rpc('get_share_rewards_summary');
  if (error) throw new Error(error.message);
  return data as ShareRewardsSummary;
}

export async function getShareWalletBalance(): Promise<number> {
  const { data, error } = await supabase.rpc('get_share_rewards_summary');
  if (error) throw new Error(error.message);
  return Number((data as { balance_iqd?: number | string } | null)?.balance_iqd ?? 0);
}

export async function requestShareWithdrawal(input: {
  amountIqd: number;
  paymentMethod: string;
  recipientName: string;
  recipientAccount?: string;
  recipientPhone?: string;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('request_share_withdrawal', {
    p_amount_iqd: input.amountIqd,
    p_payment_method: input.paymentMethod,
    p_recipient_name: input.recipientName.trim(),
    p_recipient_account: input.recipientAccount?.trim() || null,
    p_recipient_phone: input.recipientPhone?.trim() || null,
    p_user_note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function listPendingShareWithdrawals(): Promise<PendingShareWithdrawal[]> {
  const { data, error } = await supabase
    .from('share_withdrawal_requests')
    .select('id,user_id,amount_iqd,payment_method,recipient_name,recipient_account,recipient_phone,status,admin_note,payout_reference,requested_at,reviewed_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingShareWithdrawal[];
}

export async function reviewShareWithdrawal(input: {
  requestId: string;
  action: 'paid' | 'rejected';
  adminNote?: string;
  payoutReference?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('review_share_withdrawal', {
    p_request_id: input.requestId,
    p_action: input.action,
    p_admin_note: input.adminNote?.trim() || null,
    p_payout_reference: input.payoutReference?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
