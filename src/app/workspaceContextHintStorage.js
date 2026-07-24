// Persiste apenas localmente se o usuario ja recebeu a explicacao curta ao
// trocar de espaço PJ->PF ou PF->PJ (UX5) -- chaves versionadas, mesma
// estrategia segura de features/theme/themeStorage.js e
// features/uni-instant/uniVoiceHintStorage.js: nunca lanca excecao, nunca
// bloqueia a UI se o storage estiver indisponivel.

export const WORKSPACE_CONTEXT_HINT_KEYS = Object.freeze({
  personal: 'uniflow.workspace-context-hint.v1.personal-seen',
  business: 'uniflow.workspace-context-hint.v1.business-seen',
});

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readWorkspaceContextHintSeen(workspaceType, storage = getBrowserStorage()) {
  const key = WORKSPACE_CONTEXT_HINT_KEYS[workspaceType];
  if (!key || !storage) return false;

  try {
    return storage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function writeWorkspaceContextHintSeen(workspaceType, storage = getBrowserStorage()) {
  const key = WORKSPACE_CONTEXT_HINT_KEYS[workspaceType];
  if (!key || !storage) return;

  try {
    storage.setItem(key, 'true');
  } catch {
    // Dica de contexto nao deve interromper a aplicacao se o storage falhar.
  }
}
