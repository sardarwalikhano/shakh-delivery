import { supabase } from '@/lib/supabase/client';

export type ManualPaymentProvider = 'fastpay' | 'fib' | 'asia_hawala';
export type ManualPaymentPurpose = 'home_living_post_fee' | 'umrah_booking';
export type ManualPaymentStatus = 'pending_review' | 'approved' | 'rejected';

export type ManualPaymentMethod = {
  id: string;
  provider: ManualPaymentProvider;
  label_ku: string;
  account_identifier: string | null;
  account_holder: string | null;
  instructions_ku: string | null;
  is_active: boolean;
};

export type ManualPaymentSubmission = {
  id: string;
  purpose: ManualPaymentPurpose;
  payer_id: string;
  post_id: string | null;
  booking_request_id: string | null;
  payment_method_id: string;
  provider_snapshot: ManualPaymentProvider;
  account_identifier_snapshot: string;
  account_holder_snapshot: string | null;
  amount_iqd: number;
  receipt_storage_path: string;
  status: ManualPaymentStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type UmrahBookingRequest = {
  id: string;
  status: 'awaiting_payment' | 'pending_payment_review' | 'confirmed' | 'payment_rejected' | 'cancelled';
  package_post_id: string;
  package_price_iqd: number;
  traveler_count: number;
  total_amount_iqd: number;
  customer_name: string;
  customer_phone: string;
  preferred_departure_date: string | null;
};

const PAYMENT_PROOF_BUCKET = 'manual-payment-proofs';
const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PAYMENT_PROOF_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function fileExtension(file: File): string {
  const valid: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return valid[file.type] ?? '';
}

function validateReceipt(file: File): void {
  if (!PAYMENT_PROOF_TYPES.has(file.type)) {
    throw new Error('وەسڵ دەبێت JPG، PNG، WebP یان PDF بێت.');
  }
  if (file.size <= 0 || file.size > PAYMENT_PROOF_MAX_BYTES) {
    throw new Error('قەبارەی وەسڵ دەبێت لە ٥ مێگابایت زیاتر نەبێت.');
  }
}

export async function getActiveManualPaymentMethods(): Promise<ManualPaymentMethod[]> {
  const { data, error } = await supabase
    .from('manual_payment_methods')
    .select('id,provider,label_ku,account_identifier,account_holder,instructions_ku,is_active')
    .eq('is_active', true)
    .order('provider', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ManualPaymentMethod[]).filter((method) => Boolean(method.account_identifier?.trim()));
}

export async function getManualPaymentMethodsForAdmin(): Promise<ManualPaymentMethod[]> {
  const { data, error } = await supabase
    .from('manual_payment_methods')
    .select('id,provider,label_ku,account_identifier,account_holder,instructions_ku,is_active')
    .order('provider', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ManualPaymentMethod[];
}

export async function saveManualPaymentMethod(input: {
  id: string;
  accountIdentifier: string;
  accountHolder: string;
  instructions: string;
  isActive: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('manual_payment_methods')
    .update({
      account_identifier: input.accountIdentifier.trim() || null,
      account_holder: input.accountHolder.trim() || null,
      instructions_ku: input.instructions.trim() || null,
      is_active: input.isActive,
    })
    .eq('id', input.id);
  if (error) throw error;
}

export async function submitManualPayment(input: {
  purpose: ManualPaymentPurpose;
  targetId: string;
  paymentMethodId: string;
  amountIqd: number;
  receiptFile: File;
}): Promise<ManualPaymentSubmission> {
  validateReceipt(input.receiptFile);
  if (!Number.isFinite(input.amountIqd) || input.amountIqd <= 0) {
    throw new Error('بڕی پارەی نێردراو دروست نییە.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('پێویستە سەرەتا بچیتە ژوورەوە.');
  const userId = authData.user.id;

  const { data: method, error: methodError } = await supabase
    .from('manual_payment_methods')
    .select('id,provider,is_active,account_identifier,account_holder')
    .eq('id', input.paymentMethodId)
    .eq('is_active', true)
    .maybeSingle();
  if (methodError) throw methodError;
  if (!method || !method.account_identifier?.trim()) {
    throw new Error('ئەم شێوازی پارەدانە ئێستا بەردەست نییە.');
  }

  const extension = fileExtension(input.receiptFile);
  if (!extension) throw new Error('جۆری فایلەکە پشتگیری ناکرێت.');
  const proofPath = `${userId}/${input.targetId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PAYMENT_PROOF_BUCKET)
    .upload(proofPath, input.receiptFile, {
      cacheControl: '3600',
      contentType: input.receiptFile.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const row = {
    purpose: input.purpose,
    payer_id: userId,
    post_id: input.purpose === 'home_living_post_fee' ? input.targetId : null,
    booking_request_id: input.purpose === 'umrah_booking' ? input.targetId : null,
    payment_method_id: method.id,
    provider_snapshot: method.provider,
    account_identifier_snapshot: method.account_identifier,
    account_holder_snapshot: method.account_holder ?? null,
    amount_iqd: input.amountIqd,
    receipt_storage_path: proofPath,
    status: 'pending_review',
  };

  const { data, error } = await supabase
    .from('manual_payment_submissions')
    .insert(row)
    .select('id,purpose,payer_id,post_id,booking_request_id,payment_method_id,provider_snapshot,account_identifier_snapshot,account_holder_snapshot,amount_iqd,receipt_storage_path,status,admin_note,reviewed_by,reviewed_at,created_at')
    .single();

  if (error) {
    await supabase.storage.from(PAYMENT_PROOF_BUCKET).remove([proofPath]).catch(() => undefined);
    throw error;
  }
  return data as ManualPaymentSubmission;
}

export async function createUmrahBookingRequest(input: {
  packagePostId: string;
  customerName: string;
  customerPhone: string;
  travelerCount: number;
  preferredDepartureDate: string | null;
  customerNote: string;
}): Promise<UmrahBookingRequest> {
  const { data, error } = await supabase.rpc('create_umrah_booking_request', {
    p_package_post_id: input.packagePostId,
    p_customer_name: input.customerName.trim(),
    p_customer_phone: input.customerPhone.trim(),
    p_traveler_count: input.travelerCount,
    p_preferred_departure_date: input.preferredDepartureDate || null,
    p_customer_note: input.customerNote.trim() || null,
  });
  if (error) throw error;
  return data as UmrahBookingRequest;
}

export async function listManualPaymentSubmissions(): Promise<ManualPaymentSubmission[]> {
  const { data, error } = await supabase
    .from('manual_payment_submissions')
    .select('id,purpose,payer_id,post_id,booking_request_id,payment_method_id,provider_snapshot,account_identifier_snapshot,account_holder_snapshot,amount_iqd,receipt_storage_path,status,admin_note,reviewed_by,reviewed_at,created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as ManualPaymentSubmission[];
}

export async function getPaymentReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function reviewManualPaymentSubmission(input: {
  submissionId: string;
  decision: 'approved' | 'rejected';
  adminNote: string;
}): Promise<void> {
  const { error } = await supabase.rpc('review_manual_payment_submission', {
    p_submission_id: input.submissionId,
    p_decision: input.decision,
    p_admin_note: input.adminNote.trim() || null,
  });
  if (error) throw error;
}
