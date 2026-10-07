const REMEMBER_ME_KEY = 'shakh.remember_me';
export const SUPABASE_STORAGE_KEY = 'shakh-auth';

function getStorage(): Storage {
  return window.localStorage.getItem(REMEMBER_ME_KEY) === 'false'
    ? window.sessionStorage
    : window.localStorage;
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
    return getStorage().getItem(key);
  },
  setItem(key: string, value: string): void {
    getStorage().setItem(key, value);
  },
  removeItem(key: string): void {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};
