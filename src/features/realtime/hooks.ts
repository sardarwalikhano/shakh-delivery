import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export function useRealtimeOrder(orderId: string | undefined, onChange: () => void) {
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-realtime:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => onChange(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [onChange, orderId]);
}

export function useRealtimeDelivery(deliveryId: string | undefined, onChange: () => void) {
  useEffect(() => {
    if (!deliveryId) return;
    const channel = supabase
      .channel(`delivery-realtime:${deliveryId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deliveries', filter: `id=eq.${deliveryId}` },
        () => onChange(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [deliveryId, onChange]);
}

export function useRealtimeCaptainDeliveries(userId: string | undefined, onChange: () => void) {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`captain-deliveries-realtime:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliveries', filter: `captain_id=eq.${userId}` },
        () => onChange(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [onChange, userId]);
}

export function useRealtimeCustomerOrders(userId: string | undefined, onChange: () => void) {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`customer-orders-realtime:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `customer_id=eq.${userId}` },
        () => onChange(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [onChange, userId]);
}
