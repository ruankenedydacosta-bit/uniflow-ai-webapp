import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createResult(data, error = null) {
  return {
    data,
    error,
    isConfigured: isSupabaseConfigured,
  };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
  });
}

function createValidationResult(message) {
  return createResult(null, {
    code: 'INVALID_WORKSPACE_MEMBERSHIP_REQUEST',
    message,
  });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// Le a propria membership (role/status) do usuario autenticado num workspace.
// A policy `workspace_members_select_active_member` (20260710_001) libera
// select a qualquer membro ATIVO do mesmo workspace -- inclusive a propria
// linha do usuario que esta chamando -- entao esta leitura funciona sob RLS
// sem precisar de nenhum privilegio elevado.
//
// Retorna data=null (sem erro) quando nao existe linha correspondente --
// isso e um estado normal (ex.: o owner pode nunca ter sido inserido em
// workspace_members) e deve ser tratado como "sem role conhecido" por quem
// consome este service, nao como falha.
export async function getMyWorkspaceMembership(workspaceId, userId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(userId)) {
    return createValidationResult('Workspace ou usuário inválido para consultar papel.');
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, status')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  return createResult(data, error);
}
