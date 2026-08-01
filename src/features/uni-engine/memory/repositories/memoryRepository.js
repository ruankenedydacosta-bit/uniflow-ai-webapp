// Interface do repositório de memória (Fase 3).
//
// O Uni Engine NUNCA importa Supabase diretamente — a comunicação passa por
// esta interface. Adapters possíveis: in-memory (testes/demo) e Supabase.
//
// Todos os métodos retornam { data, error } — nunca lançam erro não tratado.
// scope = { userId, workspaceId, conversationId? } — sempre derivado da
// sessão autenticada, NUNCA aceito vindo do texto do usuário.

export const MEMORY_REPOSITORY_METHODS = Object.freeze([
  'createCandidate',
  'appendEvidence',
  'getById',
  'findBySubject',
  'findRelevant',
  'listEvidence',
  'updateMemory',
  'markConfirmed',
  'markContested',
  'supersede',
  'expire',
  'forget',
  'deleteAllForUser',
  'deleteAllForWorkspace',
]);

export function createRepoResult(data, error = null) {
  return { data, error };
}

export function createRepoError(code, message, details = null) {
  return { code, message, details };
}

// Normaliza qualquer erro em um objeto { code, message } seguro para o
// serviço (nunca vaza stack/secret).
export function normalizeRepoError(error, fallbackCode = 'MEMORY_REPOSITORY_FAILED') {
  if (!error) return createRepoError(fallbackCode, 'Falha desconhecida do repositório de memória.');
  if (typeof error === 'object' && typeof error.code === 'string' && error.code) {
    return {
      code: error.code,
      message: typeof error.message === 'string' ? error.message : 'Falha do repositório de memória.',
      details: error.details ?? null,
    };
  }
  return createRepoError(fallbackCode, 'Falha do repositório de memória.');
}

// Valida o escopo antes de QUALQUER operação: userId e workspaceId são
// obrigatórios (isolamento por usuário/workspace, seção 20 da especificação).
export function validateMemoryScope(scope) {
  if (!scope || typeof scope !== 'object') {
    return { valid: false, error: createRepoError('MEMORY_SCOPE_REQUIRED', 'Escopo de memória ausente.') };
  }
  if (typeof scope.userId !== 'string' || !scope.userId) {
    return { valid: false, error: createRepoError('MEMORY_USER_ID_REQUIRED', 'Usuário ausente no escopo de memória.') };
  }
  if (typeof scope.workspaceId !== 'string' || !scope.workspaceId) {
    return { valid: false, error: createRepoError('MEMORY_WORKSPACE_ID_REQUIRED', 'Workspace ausente no escopo de memória.') };
  }
  return { valid: true, error: null };
}
