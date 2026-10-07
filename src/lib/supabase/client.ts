import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/config/env';
import { authStorage, SUPABASE_STORAGE_KEY } from '@/lib/auth/storage';

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storageKey: SUPABASE_STORAGE_KEY,
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
