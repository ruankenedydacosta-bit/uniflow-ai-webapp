// Uni Engine — Fase 20: Tool Calling (base). Seleção e gates.
//
// Decide se uma tool call pode ser executada. Toda tool passa por aqui; os
// gates são avaliativos e nunca chamam o handler. Qualquer falha de gate →
// decisão segura (skip/fallback), nunca execução.
import { isToolCallSelectionDecision } from '../types/index.js';
import { validateToolCall } from '../contracts/index.js';

function createSelection({
  decision = 'fallback',
  reason,
  toolCallId = null,
  toolName = null,
  gates = {},
} = {}) {
  const safeDecision = isToolCallSelectionDecision(decision) ? decision : 'fallback';
  return Object.freeze({
    decision: safeDecision,
    reason: typeof reason === 'string' ? reason : 'GATE_FAILED',
    toolCallId: typeof toolCallId === 'string' ? toolCallId : null,
    toolName: typeof toolName === 'string' ? toolName : null,
    gates: Object.freeze({
      configEnabled: Boolean(gates.configEnabled),
      toolFound: Boolean(gates.toolFound),
      toolEnabled: Boolean(gates.toolEnabled),
      authorized: Boolean(gates.authorized),
      executionAllowed: Boolean(gates.executionAllowed),
      pendingActionBlocked: Boolean(gates.pendingActionBlocked),
      confirmationPendingBlocked: Boolean(gates.confirmationPendingBlocked),
    }),
    serializable: true,
  });
}

export function selectToolCall({
  toolCall,
  registry,
  config,
  authorization,
} = {}) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const safeAuthorization = authorization && typeof authorization === 'object' ? authorization : {};
  const toolCallId = toolCall && typeof toolCall.id === 'string' ? toolCall.id : null;
  const toolName = toolCall && typeof toolCall.name === 'string' ? toolCall.name : null;

  // Gate 1 — Tool Calling desligado: nenhuma seleção, nenhum dispatcher.
  if (safeConfig.toolCallingEnabled !== true) {
    return createSelection({
      decision: 'fallback',
      reason: 'TOOL_CALLING_DISABLED',
      toolCallId,
      toolName,
      gates: { configEnabled: false },
    });
  }

  // Gate 2 — tool call inválida (sem id ou nome): skip seguro.
  const validation = validateToolCall(toolCall);
  if (!validation.valid) {
    return createSelection({
      decision: 'skip',
      reason: 'TOOL_CALL_INVALID',
      toolCallId,
      toolName,
      gates: { configEnabled: true },
    });
  }

  // Gate 3 — ferramenta inexistente no registry.
  const registrySafe = registry && typeof registry.has === 'function' ? registry : null;
  const toolFound = Boolean(registrySafe && registrySafe.has(toolCall.name));
  if (!toolFound) {
    return createSelection({
      decision: 'skip',
      reason: 'TOOL_NOT_FOUND',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      gates: { configEnabled: true, toolFound: false },
    });
  }

  // Gate 4 — ferramenta desabilitada no registry.
  const toolEnabled = registrySafe.isEnabled(toolCall.name);
  if (!toolEnabled) {
    return createSelection({
      decision: 'skip',
      reason: 'TOOL_DISABLED',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      gates: { configEnabled: true, toolFound: true, toolEnabled: false },
    });
  }

  // Gate 5 — autorização explícita ausente (falha segura por padrão).
  if (safeAuthorization.authorized !== true) {
    return createSelection({
      decision: 'skip',
      reason: 'AUTHORIZATION_MISSING',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      gates: { configEnabled: true, toolFound: true, toolEnabled: true, authorized: false },
    });
  }

  // Gate 6 — executionAllowed explícito.
  if (safeAuthorization.executionAllowed !== true) {
    return createSelection({
      decision: 'skip',
      reason: 'EXECUTION_NOT_ALLOWED',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      gates: {
        configEnabled: true,
        toolFound: true,
        toolEnabled: true,
        authorized: true,
        executionAllowed: false,
      },
    });
  }

  // Gate 7 — Pending Action ativa: preserva e bloqueia execução.
  if (safeAuthorization.pendingAction === true) {
    return createSelection({
      decision: 'skip',
      reason: 'PENDING_ACTION_ACTIVE',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      gates: {
        configEnabled: true,
        toolFound: true,
        toolEnabled: true,
        authorized: true,
        executionAllowed: true,
        pendingActionBlocked: true,
      },
    });
  }

  // Gate 8 — confirmação pendente: preserva e bloqueia execução.
  if (safeAuthorization.confirmationPending === true) {
    return createSelection({
      decision: 'skip',
      reason: 'CONFIRMATION_PENDING',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      gates: {
        configEnabled: true,
        toolFound: true,
        toolEnabled: true,
        authorized: true,
        executionAllowed: true,
        confirmationPendingBlocked: true,
      },
    });
  }

  // Aprovado: única rota para o dispatcher/executor.
  return createSelection({
    decision: 'execute',
    reason: 'APPROVED',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    gates: {
      configEnabled: true,
      toolFound: true,
      toolEnabled: true,
      authorized: true,
      executionAllowed: true,
    },
  });
}
