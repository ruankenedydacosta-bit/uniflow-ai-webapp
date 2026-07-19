import { isSupabaseConfigured, supabase } from './supabaseClient.js';

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Os saldos reais exigem uma conexão configurada.',
  });
}

export async function listDerivedAccountBalances() {
  if (!supabase) return createUnavailableResult([]);

  const { data, error } = await supabase.rpc('get_derived_account_balances');
  return createResult(data ?? [], error);
}

export async function getDerivedWorkspaceBalance() {
  if (!supabase) return createUnavailableResult(null);

  const { data, error } = await supabase.rpc('get_derived_workspace_balance');
  return createResult(data?.[0]?.derived_balance ?? null, error);
}
