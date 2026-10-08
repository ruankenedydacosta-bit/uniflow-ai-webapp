// Painel de administração da plataforma. Tudo passa pelas funções admin_* das
// migrations 056 e 058, que conferem is_platform_admin() no banco: quem não é
// da equipe recebe erro mesmo chamando direto.
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

// Troca de nível pela lista (migration 058): plano manual ativo mantém a data
// de fim; quem não tem ganha 1 mês.
export async function setUserPlan({ userId, tierId }) {
  if (!supabase) return createUnavailableResult(null);

  const { data, error } = await supabase.rpc('admin_set_user_plan', {
    p_user_id: userId,
    p_tier_id: tierId,
  });
  return createResult(data ?? null, error);
}

export async function setUserBlocked({ userId, blocked, note }) {
  if (!supabase) return createUnavailableResult(null);

  const { data, error } = await supabase.rpc('admin_set_user_blocked', {
    p_user_id: userId,
    p_blocked: blocked,
    p_note: note ?? null,
  });
  return createResult(data ?? null, error);
}
