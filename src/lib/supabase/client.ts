import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/config/env';

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
