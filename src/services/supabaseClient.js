import { createClient } from '@supabase/supabase-js';

const supabaseEnv = import.meta.env ?? {};

export const supabaseUrl = supabaseEnv.VITE_SUPABASE_URL ?? '';
export const supabaseAnonKey = supabaseEnv.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// O demo mockado continua funcionando sem .env; services lidam com o client nulo.
export const supabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const supabase = supabaseClient;

export function getSupabaseConfigStatus() {
  return {
    isConfigured: isSupabaseConfigured,
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
  };
}
