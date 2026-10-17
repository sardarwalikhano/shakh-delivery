import { supabase } from '@/lib/supabase/client';

export type DeliveryPoint = {
  latitude: number;
  longitude: number;
};

export function calculateDistanceKm(origin: DeliveryPoint, destination: DeliveryPoint): number {
  const toRadians = (value: number) => value * (Math.PI / 180);
  const latDelta = toRadians(destination.latitude - origin.latitude);
  const lngDelta = toRadians(destination.longitude - origin.longitude);
  const originLat = toRadians(origin.latitude);
  const destinationLat = toRadians(destination.latitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lngDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function isWithinDeliveryZone(
  originLatitude: number | null | undefined,
  originLongitude: number | null | undefined,
  radiusKm: number | null | undefined,
  destination: DeliveryPoint,
): boolean {
  if (originLatitude == null || originLongitude == null || radiusKm == null) return false;
  if (!Number.isFinite(originLatitude) || !Number.isFinite(originLongitude) || !Number.isFinite(radiusKm)) return false;
  if (originLatitude < -90 || originLatitude > 90 || originLongitude < -180 || originLongitude > 180 || radiusKm < 1) return false;
  return calculateDistanceKm(
    { latitude: originLatitude, longitude: originLongitude },
    destination,
  ) <= radiusKm;
}

export async function saveMyDeliveryPoint(point: DeliveryPoint): Promise<void> {
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
    || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    throw new Error('شوێنی GPS دروست نییە.');
  }
  const { error } = await supabase.rpc('set_my_delivery_point', {
    p_latitude: point.latitude,
    p_longitude: point.longitude,
  });
  if (error) throw new Error(readableDeliveryError(error.message));
}

export function readableDeliveryError(message: string): string {
  if (message.includes('DELIVERY_ZONE_UNAVAILABLE')) {
    return 'بۆ ئێرە بەردەست نییە؛ ناونیشانی گەیاندن لە دەرەوەی زۆنی دیاریکراوە یان فرۆشیار هێشتا شوێنی زۆنەکەی دیاری نەکردووە.';
  }
  return message;
}
