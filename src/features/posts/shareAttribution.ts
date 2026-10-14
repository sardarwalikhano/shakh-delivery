const ATTRIBUTION_STORAGE_KEY = 'shakh.post_share_attribution.v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StoredAttribution = { linkId: string; capturedAt: number };
type AttributionMap = Record<string, StoredAttribution>;

function readAttributions(): AttributionMap {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([postId, value]) => {
      if (!UUID_PATTERN.test(postId) || !value || typeof value !== 'object') return false;
      const entry = value as Partial<StoredAttribution>;
      return typeof entry.linkId === 'string'
        && UUID_PATTERN.test(entry.linkId)
        && typeof entry.capturedAt === 'number'
        && now - entry.capturedAt >= 0
        && now - entry.capturedAt <= ATTRIBUTION_TTL_MS;
    })) as AttributionMap;
  } catch {
    return {};
  }
}

/** Captures the database-issued share-link ID from /posts/:id?via=... before auth redirects can remove the query string. */
export function capturePostShareAttribution(pathname: string, search: string): void {
  const match = pathname.match(/^\/posts\/([0-9a-f-]{36})\/?$/i);
  if (!match || !UUID_PATTERN.test(match[1])) return;
  const linkId = new URLSearchParams(search).get('via');
  if (!linkId || !UUID_PATTERN.test(linkId)) return;

  try {
    const current = readAttributions();
    current[match[1]] = { linkId, capturedAt: Date.now() };
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Attribution is optional if browser storage is blocked; checkout still works.
  }
}

export function getPostShareLinkId(postId: string): string | null {
  if (!UUID_PATTERN.test(postId)) return null;
  return readAttributions()[postId]?.linkId ?? null;
}

export function getPostShareLinkMap(postIds: string[]): Record<string, string> {
  const attributions = readAttributions();
  const result: Record<string, string> = {};
  for (const postId of postIds) {
    const linkId = UUID_PATTERN.test(postId) ? attributions[postId]?.linkId : undefined;
    if (linkId) result[postId] = linkId;
  }
  return result;
}
