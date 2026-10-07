const PENDING_REDIRECT_KEY = 'shakh.pending_auth_redirect';

const FALLBACK_REDIRECT = '/dashboard';

export function sanitizeInternalPath(path: string | null | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return FALLBACK_REDIRECT;
  if (path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/forgot-password') || path.startsWith('/reset-password') || path.startsWith('/verify-email')) {
    return FALLBACK_REDIRECT;
  }
  return path;
}

export function rememberAuthRedirect(path: string): void {
  window.sessionStorage.setItem(PENDING_REDIRECT_KEY, sanitizeInternalPath(path));
}

export function consumeAuthRedirect(): string {
  const target = sanitizeInternalPath(window.sessionStorage.getItem(PENDING_REDIRECT_KEY));
  window.sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  return target;
}
