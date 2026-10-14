const PENDING_REDIRECT_KEY = 'shakh.pending_auth_redirect';
const FALLBACK_REDIRECT = '/dashboard';
const AUTH_ONLY_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]);

/**
 * Accept only same-origin absolute paths. Keep valid deep links (path, query,
 * and hash) while rejecting protocol-relative URLs, backslash parsing tricks,
 * control characters, and auth-loop destinations.
 */
export function sanitizeInternalPath(path: string | null | undefined): string {
  if (
    !path
    || !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(path)
  ) {
    return FALLBACK_REDIRECT;
  }

  let parsed: URL;
  try {
    parsed = new URL(path, 'https://shakh-internal.invalid');
  } catch {
    return FALLBACK_REDIRECT;
  }

  if (parsed.origin !== 'https://shakh-internal.invalid' || AUTH_ONLY_PATHS.has(parsed.pathname)) {
    return FALLBACK_REDIRECT;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function rememberAuthRedirect(path: string): void {
  window.sessionStorage.setItem(PENDING_REDIRECT_KEY, sanitizeInternalPath(path));
}

export function consumeAuthRedirect(): string {
  const target = sanitizeInternalPath(window.sessionStorage.getItem(PENDING_REDIRECT_KEY));
  window.sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  return target;
}
