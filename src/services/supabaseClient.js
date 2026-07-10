const supabaseEnv = import.meta.env ?? {};

export const supabaseUrl = supabaseEnv.VITE_SUPABASE_URL ?? '';
export const supabaseAnonKey = supabaseEnv.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// O demo mockado continua funcionando sem Supabase. Quando
// @supabase/supabase-js for instalado, este ponto vira o createClient real.
export const supabaseClient = null;

export function getSupabaseConfigStatus() {
  return {
    isConfigured: isSupabaseConfigured,
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
  };
}

