// Painel de administração da plataforma. Tudo passa pelas funções admin_* da
// migration 055, que conferem is_platform_admin() no banco: quem não é da
// equipe recebe erro mesmo chamando direto.
import { isSupabaseConfigured, supabase } from './supabaseClient.js';

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'O painel de administração exige uma conexão configurada.',
  });
}

export async function getIsPlatformAdmin() {
  if (!supabase) return createUnavailableResult(false);

  const { data, error } = await supabase.rpc('is_platform_admin');
  return createResult(data === true, error);
}

export async function listPlatformUsers() {
  if (!supabase) return createUnavailableResult([]);

  const { data, error } = await supabase.rpc('admin_list_users');
  return createResult(data ?? [], error);
}

export async function grantManualPlan({ userId, tierId, months, note }) {
  if (!supabase) return createUnavailableResult(null);

  const { data, error } = await supabase.rpc('admin_grant_manual_plan', {
    p_user_id: userId,
    p_tier_id: tierId,
    p_months: months,
    p_note: note ?? null,
  });
  return createResult(data ?? null, error);
}

export async function revokeManualPlan({ userId, note }) {
  if (!supabase) return createUnavailableResult(null);

  const { data, error } = await supabase.rpc('admin_revoke_manual_plan', {
    p_user_id: userId,
    p_note: note ?? null,
  });
  return createResult(data ?? null, error);
}
