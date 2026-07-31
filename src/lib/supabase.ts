import { createClient } from '@supabase/supabase-js';

// Project URL is public; hardcoded to avoid stale env / Vercel misconfig.
const supabaseUrl = 'https://znifjljszxlvoqgvgoad.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseAnonKey) {
  throw new Error(
    'חסר VITE_SUPABASE_ANON_KEY — הגדירו אותו ב-.env.local וב-Vercel',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export { supabaseUrl };
