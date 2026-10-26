import { supabase } from '@/lib/supabase/client';

export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'picked_up'
  | 'on_the_way'
  | 'arrived'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export type Delivery = {
  id: string;
  order_id: string;
  captain_id: string | null;
  status: DeliveryStatus;
  assigned_by: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  picked_up_at: string | null;
  on_the_way_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  captain_note: string | null;
  dispatch_note: string | null;
  created_at: string;
  order: {
    id: string;
    order_number: string;
    customer_id: string;
    status: string;
    total_iqd: number;
    delivery_address: string;
    delivery_lat: number | null;
    delivery_lng: number | null;
    customer_note: string | null;
    store: { id: string; name_ku: string; name_en: string } | null;
  } | null;
};

export type Captain = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
};

export type CaptainPresence = {
  is_online: boolean;
  last_seen_at: string | null;
};

export async function setCaptainPresence(isOnline: boolean): Promise<CaptainPresence> {
  const { data, error } = await supabase.rpc('set_captain_presence', { p_is_online: isOnline });
  if (error) throw error;
  const presence = data as CaptainPresence | null;
  if (!presence || typeof presence.is_online !== 'boolean') {
    throw new Error('دۆخی کاپتن لە سێرڤەرەوە پشتڕاست نەکرایەوە.');
  }
  return presence;
}

export async function getMyCaptainPresence(): Promise<CaptainPresence> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_online,last_seen_at')
    .single();
  if (error) throw error;
  return { is_online: Boolean(data.is_online), last_seen_at: data.last_seen_at as string | null };
}

const deliverySelect = `
  id,order_id,captain_id,status,assigned_by,assigned_at,accepted_at,picked_up_at,
  on_the_way_at,arrived_at,delivered_at,failed_at,cancelled_at,last_lat,last_lng,
  last_location_at,captain_note,dispatch_note,created_at,
  orders!inner(
    id,order_number,customer_id,status,total_iqd,delivery_address,delivery_lat,delivery_lng,customer_note,
    stores(id,name_ku,name_en)
  )
`;

function mapDelivery(row: Record<string, unknown>): Delivery {
  return {
    ...(row as Omit<Delivery, 'order'>),
    order: ((row.orders ?? null) as Delivery['order']),
  };
}

export async function claimDelivery(deliveryId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_delivery', { p_delivery_id: deliveryId });
  if (error) throw error;
}

export async function getMyDeliveries(): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select(deliverySelect)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapDelivery);
}

export async function getDispatchDeliveries(): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select(deliverySelect)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapDelivery);
}

export async function getAvailableCaptains(): Promise<Captain[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,phone,avatar_url,is_online,last_seen_at,user_roles!inner(role)')
    .eq('user_roles.role', 'captain')
    .eq('is_online', true)
    .gte('last_seen_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    full_name: row.full_name as string | null,
    phone: row.phone as string | null,
    avatar_url: row.avatar_url as string | null,
    is_online: Boolean(row.is_online),
    last_seen_at: row.last_seen_at as string | null,
  }));
}

export async function createDelivery(orderId: string, assignedBy: string, captainId: string | null, dispatchNote?: string): Promise<Delivery> {
  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      order_id: orderId,
      assigned_by: assignedBy,
      captain_id: captainId,
      dispatch_note: dispatchNote?.trim() || null,
      status: captainId ? 'assigned' : 'pending',
    })
    .select(deliverySelect)
    .single();
  if (error) throw error;
  return mapDelivery(data as Record<string, unknown>);
}

export async function assignCaptain(deliveryId: string, captainId: string, assignedBy: string, dispatchNote?: string): Promise<Delivery> {
  const { data, error } = await supabase
    .from('deliveries')
    .update({
      captain_id: captainId,
      assigned_by: assignedBy,
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      dispatch_note: dispatchNote?.trim() || null,
    })
    .eq('id', deliveryId)
    .select(deliverySelect)
    .single();
  if (error) throw error;
  return mapDelivery(data as Record<string, unknown>);
}

export async function updateCaptainDelivery(deliveryId: string, status: DeliveryStatus, note?: string): Promise<Delivery> {
  const { data, error } = await supabase
    .from('deliveries')
    .update({ status, captain_note: note?.trim() || null })
    .eq('id', deliveryId)
    .select(deliverySelect)
    .single();
  if (error) throw error;
  return mapDelivery(data as Record<string, unknown>);
}

export async function updateCaptainLocation(deliveryId: string, latitude: number, longitude: number): Promise<void> {
  const { error } = await supabase
    .from('deliveries')
    .update({ last_lat: latitude, last_lng: longitude, last_location_at: new Date().toISOString() })
    .eq('id', deliveryId);
  if (error) throw error;
}
