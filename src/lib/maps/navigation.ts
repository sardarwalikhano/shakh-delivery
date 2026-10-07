export type Coordinates = {
  latitude: number;
  longitude: number;
};

export function isValidCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  return latitude != null && longitude != null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

export function buildGoogleMapsDirectionsUrl(destination: Coordinates, origin?: Coordinates | null): string {
  const target = `${destination.latitude},${destination.longitude}`;
  const params = new URLSearchParams({ api: '1', destination: target });
  if (origin && isValidCoordinates(origin.latitude, origin.longitude)) {
    params.set('origin', `${origin.latitude},${origin.longitude}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsLocationUrl(destination: Coordinates): string {
  const params = new URLSearchParams({ api: '1', query: `${destination.latitude},${destination.longitude}` });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
