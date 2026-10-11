const REMEMBER_ME_KEY = 'shakh.remember_me';
export const SUPABASE_STORAGE_KEY = 'shakh-auth';

function getStorage(): Storage {
  return window.localStorage.getItem(REMEMBER_ME_KEY) === 'false'
    ? window.sessionStorage
    : window.localStorage;
}

function getOtherStorage(preferred: Storage): Storage {
  return preferred === window.localStorage ? window.sessionStorage : window.localStorage;
}

export function setRememberMePreference(remember: boolean): void {
  window.localStorage.setItem(REMEMBER_ME_KEY, String(remember));
}

export function getRememberMePreference(): boolean {
  return window.localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
}

export function clearAuthStorage(): void {
  window.localStorage.removeItem(SUPABASE_STORAGE_KEY);
  window.sessionStorage.removeItem(SUPABASE_STORAGE_KEY);
}

export const authStorage = {
  getItem(key: string): string | null {
    const preferred = getStorage();
    const value = preferred.getItem(key);
    if (value !== null) return value;

    // Migrate sessions written by an older app version or under a different
    // remember-me choice instead of treating a valid session as a signed-out user.
    const other = getOtherStorage(preferred);
    const fallback = other.getItem(key);
    if (fallback === null) return null;

    preferred.setItem(key, fallback);
    other.removeItem(key);
    return fallback;
  },
  setItem(key: string, value: string): void {
    const preferred = getStorage();
    preferred.setItem(key, value);
    getOtherStorage(preferred).removeItem(key);
  },
  removeItem(key: string): void {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};