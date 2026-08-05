// Uni Engine — Fase 20: Tool Calling (base). Idempotência.
//
// Garante que UMA tool call é executada no MÁXIMO UMA vez por turno.
// A chave é composta por identidade do turno + identidade do workspace +
// identidade da conversa + toolCallId. Um novo turno, nova conversa ou novo
// workspace gera chave diferente e pode executar novamente. Turnos stale são
// rejeitados por comparação de identidade.
import { createToolResult } from '../contracts/index.js';

function buildKey({ turnId, workspaceId, conversationId, toolCallId } = {}) {
  return [
    turnId || '',
    workspaceId || '',
    conversationId || '',
    toolCallId || '',
  ].join('|');
}

export function createIdempotencyStore() {
  const store = new Map();

  function hasRun({ turnId, workspaceId, conversationId, toolCallId } = {}) {
    return store.has(buildKey({ turnId, workspaceId, conversationId, toolCallId }));
  }

  function getResult({ turnId, workspaceId, conversationId, toolCallId } = {}) {
    return store.get(buildKey({ turnId, workspaceId, conversationId, toolCallId })) ?? null;
  }

  function markRun({ turnId, workspaceId, conversationId, toolCallId, result }) {
    if (typeof toolCallId !== 'string' || toolCallId === '') return { ok: false, error: 'IDEMPOTENCY_KEY_MISSING' };
    const key = buildKey({ turnId, workspaceId, conversationId, toolCallId });
    const safeResult = result && typeof result === 'object'
      ? result
      : createToolResult({
          toolCallId,
          toolName: result?.toolName ?? null,
          status: 'completed',
          executed: true,
          authorized: true,
          executionAllowed: true,
        });
    store.set(key, safeResult);
    return { ok: true, key };
  }

  // Uma chamada é stale quando existe um resultado de um turno ANTERIOR e o
  // turno atual é diferente — sinal de turno reentrante/mensagem repetida.
  function isStaleTurn({ turnId, workspaceId, conversationId } = {}) {
    const currentTurnId = turnId || '';
    if (!currentTurnId) return false;
    for (const key of store.keys()) {
      const parts = key.split('|');
      const storedTurnId = parts[0] || '';
      const storedWorkspaceId = parts[1] || '';
      const storedConversationId = parts[2] || '';
      if (storedTurnId && storedTurnId !== currentTurnId) {
        if (workspaceId && storedWorkspaceId && storedWorkspaceId !== workspaceId) continue;
        if (conversationId && storedConversationId && storedConversationId !== conversationId) continue;
        return true;
      }
    }
    return false;
  }

  function hasTurnId(turnId) {
    if (typeof turnId !== 'string' || turnId === '') return false;
    for (const key of store.keys()) {
      if (key.split('|')[0] === turnId) return true;
    }
    return false;
  }

  function clear() {
    store.clear();
    return { ok: true };
  }

  function size() {
    return store.size;
  }

  return {
    hasRun,
    getResult,
    markRun,
    isStaleTurn,
    hasTurnId,
    clear,
    size,
  };
}

export { buildKey };
