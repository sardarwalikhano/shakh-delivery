const requiredBrowserEnv = (name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY') => {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const env = {
  supabaseUrl: requiredBrowserEnv('VITE_SUPABASE_URL'),
  supabasePublishableKey: requiredBrowserEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
  publicAppUrl: import.meta.env.VITE_PUBLIC_APP_URL ?? window.location.origin,
} as const;
