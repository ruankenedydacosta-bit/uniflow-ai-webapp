// Uni Engine — Fase 20: Tool Calling (base). Dispatcher.
//
// PONTO ÚNICO de execução de tool calls. O dispatcher:
//   1. seleciona (gates);
//   2. verifica idempotência do turno;
//   3. executa via executor (única rota);
//   4. padroniza o ToolResult;
//   5. registra telemetria sanitizada.
//
// handlers nunca são chamados diretamente — toda tool passa pelo dispatcher,
// todo dispatcher usa o executor, nenhuma tool executa sem autorização.
import { selectToolCall } from '../selection/index.js';
import { executeTool } from '../executor/index.js';
import { createIdempotencyStore } from '../idempotency/index.js';
import { createToolCallingTelemetryStore } from '../telemetry/index.js';
import { createEmptyToolResult, isToolResultSerializable } from '../contracts/index.js';

function sanitizeErrorForChat(error) {
  if (!error) return 'TOOL_CALL_ERROR';
  if (typeof error === 'string') return error;
  if (typeof error.code === 'string') return error.code;
  return 'TOOL_CALL_ERROR';
}

// `idempotency`/`telemetry` são sempre instâncias novas por chamada quando o
// chamador não fornece as suas — nunca um singleton de módulo (Fase 20.3:
// dois stores compartilhados por todo o processo violavam o isolamento por
// workspace/conversa estabelecido na Fase 19.1, mesmo com chaves compostas).
export function createToolCallingDispatcher({ idempotency, telemetry } = {}) {
  const store = idempotency && typeof idempotency.markRun === 'function' ? idempotency : createIdempotencyStore();
  const telemetryStore = telemetry && typeof telemetry.recordEntry === 'function'
    ? telemetry
    : createToolCallingTelemetryStore({ enabled: false });

  async function dispatchToolCall({ toolCall, registry, config, authorization, turnId = null, workspaceId = null, conversationId = null, environment = 'development' } = {}) {
    const safeConfig = config && typeof config === 'object' ? config : {};
    const safeTurnId = typeof turnId === 'string' && turnId !== '' ? turnId : null;
    const safeWorkspaceId = typeof workspaceId === 'string' && workspaceId !== '' ? workspaceId : null;
    const safeConversationId = typeof conversationId === 'string' && conversationId !== '' ? conversationId : null;
    const toolCallId = toolCall && typeof toolCall.id === 'string' ? toolCall.id : null;
    const toolName = toolCall && typeof toolCall.name === 'string' ? toolCall.name : null;
    const toolCallingDisabled = safeConfig.toolCallingEnabled !== true;

    const recordTelemetry = (entry) => {
      if (safeConfig.toolCallingTelemetryEnabled !== true) return;
      telemetryStore.recordEntry({ environment, ...entry });
    };

    // Tool Calling desligado: nenhum dispatcher, nenhuma execução.
    if (toolCallingDisabled) {
      const result = createEmptyToolResult({ toolCallId, toolName, status: 'skipped' });
      recordTelemetry({
        toolCallId,
        toolName,
        status: result.status,
        decision: 'fallback',
        reason: 'TOOL_CALLING_DISABLED',
        authorized: false,
        executionAllowed: false,
        hasError: false,
      });
      return { result, selection: null, executed: false, safeText: 'TOOL_CALLING_DISABLED' };
    }

    // Gate de idempotência: mesmo turno + mesma tool call nunca executa 2x.
    if (safeTurnId && toolCallId && store.hasRun({ turnId: safeTurnId, workspaceId: safeWorkspaceId, conversationId: safeConversationId, toolCallId })) {
      const prior = store.getResult({ turnId: safeTurnId, workspaceId: safeWorkspaceId, conversationId: safeConversationId, toolCallId });
      recordTelemetry({
        toolCallId,
        toolName,
        status: prior?.status ?? 'duplicate',
        decision: 'skip',
        reason: 'DUPLICATE_TURN_EXECUTION',
        authorized: Boolean(authorization?.authorized),
        executionAllowed: Boolean(authorization?.executionAllowed),
        idempotent: true,
        hasError: false,
      });
      return { result: prior, selection: null, executed: false, idempotent: true, safeText: 'TOOL_ALREADY_EXECUTED' };
    }

    const selection = selectToolCall({ toolCall, registry, config: safeConfig, authorization });

    recordTelemetry({
      toolCallId,
      toolName,
      decision: selection.decision,
      reason: selection.reason,
      authorized: Boolean(authorization?.authorized),
      executionAllowed: Boolean(authorization?.executionAllowed),
      hasError: false,
    });

    // Aprovado: executa via executor — única rota.
    if (selection.decision === 'execute' && registry && typeof registry.get === 'function') {
      const tool = registry.get(selection.toolName);
      const result = await executeTool({
        tool,
        toolCall,
        authorization,
      });
      if (safeTurnId && toolCallId) {
        store.markRun({
          turnId: safeTurnId,
          workspaceId: safeWorkspaceId,
          conversationId: safeConversationId,
          toolCallId,
          result,
        });
      }
      recordTelemetry({
        toolCallId,
        toolName,
        status: result.status,
        decision: selection.decision,
        reason: selection.reason,
        authorized: result.authorized,
        executionAllowed: result.executionAllowed,
        writes: Boolean(tool?.writes),
        latencyMs: result.latencyMs,
        hasError: result.status === 'error' || result.status === 'timeout' || result.status === 'cancelled',
        errorCode: result.error?.code ?? null,
      });
      return { result, selection, executed: result.executed, safeText: 'TOOL_EXECUTED' };
    }

    // Não aprovado: resultado padronizado sem execução.
    const result = createEmptyToolResult({
      toolCallId,
      toolName,
      status: selection.decision === 'execute' ? 'skipped' : selection.reason === 'TOOL_NOT_FOUND' ? 'not_found'
        : selection.reason === 'TOOL_DISABLED' ? 'disabled'
          : selection.reason === 'AUTHORIZATION_MISSING' ? 'unauthorized'
            : selection.reason === 'EXECUTION_NOT_ALLOWED' ? 'not_allowed'
              : 'skipped',
      authorized: Boolean(authorization?.authorized),
      executionAllowed: Boolean(authorization?.executionAllowed),
    });
    recordTelemetry({
      toolCallId,
      toolName,
      status: result.status,
      decision: selection.decision,
      reason: selection.reason,
      authorized: result.authorized,
      executionAllowed: result.executionAllowed,
      hasError: false,
    });
    return { result, selection, executed: false, safeText: selection.reason ?? 'TOOL_SKIPPED' };
  }

  return {
    dispatchToolCall,
    idempotency: store,
    telemetry: telemetryStore,
  };
}

export function isToolResultSerializableSafe(result) {
  return isToolResultSerializable(result);
}

export function toChatSafeToolResult(result) {
  if (!result || typeof result !== 'object') return { ok: false, text: 'TOOL_CALL_ERROR' };
  if (!isToolResultSerializable(result)) return { ok: false, text: 'TOOL_CALL_ERROR' };
  if (result.status === 'completed' && result.executed) {
    return { ok: true, text: 'TOOL_EXECUTED', result };
  }
  return { ok: false, text: sanitizeErrorForChat(result.error?.message) ?? 'TOOL_SKIPPED' };
}
