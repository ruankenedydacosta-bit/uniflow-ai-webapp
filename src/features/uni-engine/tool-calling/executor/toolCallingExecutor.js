// Uni Engine — Fase 20: Tool Calling (base). Executor.
//
// Executa SOMENTE ferramentas já autorizadas e já selecionadas pelo dispatcher.
// O executor nunca seleciona, nunca autoriza e nunca consulta o registry
// diretamente — recebe a definição já aprovada.
//
// Garantias:
//   - timeout com AbortSignal;
//   - erro do handler nunca escapa (resultado padronizado);
//   - resultado sempre JSON-safe (fallback para null);
//   - nenhuma escrita financeira (resultado carrega safety flags).
import {
  createToolResult,
  createEmptyToolResult,
  isSerializableValue,
} from '../contracts/index.js';

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('TOOL_TIMEOUT')), timeoutMs);
  timer.unref?.();
  return { controller, timer };
}

function safeErrorCode(error) {
  if (!error) return 'HANDLER_ERROR';
  if (typeof error.code === 'string' && error.code) return error.code;
  return 'HANDLER_ERROR';
}

function buildExecutionSignal({ externalSignal, timeoutMs }) {
  // Sem timeout e sem signal externo: nada a sinalizar.
  if (!externalSignal && !timeoutMs) {
    return { signal: null, cleanup: () => {} };
  }

  const controller = new AbortController();

  const onTimeout = () => controller.abort(new Error('TOOL_TIMEOUT'));
  const timer = timeoutMs ? setTimeout(onTimeout, timeoutMs) : null;
  if (timer) timer.unref?.();

  const onExternal = () => controller.abort(externalSignal.reason ?? new Error('SIGNAL_ABORT'));
  if (externalSignal) externalSignal.addEventListener('abort', onExternal);

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternal);
  };

  return { signal: controller.signal, cleanup };
}

export async function executeTool({
  tool,
  toolCall,
  authorization,
  timeoutMs = null,
  signal = null,
} = {}) {
  if (!tool || typeof tool.handler !== 'function') {
    return createToolResult({
      toolCallId: toolCall?.id ?? null,
      toolName: toolCall?.name ?? tool?.name ?? null,
      status: 'error',
      error: { code: 'EXECUTOR_TOOL_MISSING', message: 'EXECUTOR_TOOL_MISSING' },
    });
  }
  // Dupla verificação: o executor nunca executa sem autorização explícita,
  // mesmo que seja chamado fora do dispatcher.
  if (authorization?.authorized !== true || authorization?.executionAllowed !== true) {
    return createToolResult({
      toolCallId: toolCall?.id ?? null,
      toolName: toolCall?.name ?? tool?.name ?? null,
      status: 'unauthorized',
      authorized: Boolean(authorization?.authorized),
      executionAllowed: Boolean(authorization?.executionAllowed),
      error: { code: 'EXECUTOR_UNAUTHORIZED', message: 'EXECUTOR_UNAUTHORIZED' },
    });
  }

  const startedAt = Date.now();
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : tool.timeoutMs;
  const { signal: execSignal, cleanup } = buildExecutionSignal({
    externalSignal: signal || null,
    timeoutMs: effectiveTimeout || null,
  });

  const finish = (result) => {
    cleanup();
    const latencyMs = Date.now() - startedAt;
    return createToolResult({
      ...result,
      toolCallId: result.toolCallId ?? toolCall?.id ?? null,
      toolName: result.toolName ?? toolCall?.name ?? tool?.name ?? null,
      latencyMs,
    });
  };

  const abortReason = () => execSignal?.reason?.message ?? null;
  const isTimeoutAbort = () => abortReason() === 'TOOL_TIMEOUT';

  try {
    const handlerResult = await tool.handler({
      arguments: toolCall?.arguments ?? {},
      signal: execSignal ?? null,
      authorization: authorization?.context ?? null,
      toolCallId: toolCall?.id ?? null,
    });

    if (execSignal?.aborted) {
      return finish({
        status: isTimeoutAbort() ? 'timeout' : 'cancelled',
        authorized: true,
        executionAllowed: true,
        error: {
          code: isTimeoutAbort() ? 'TOOL_TIMEOUT' : 'TOOL_CANCELLED',
          message: isTimeoutAbort() ? 'TOOL_TIMEOUT' : 'TOOL_CANCELLED',
        },
      });
    }

    if (!isSerializableValue(handlerResult)) {
      return finish({
        status: 'error',
        authorized: true,
        executionAllowed: true,
        error: { code: 'RESULT_NOT_SERIALIZABLE', message: 'RESULT_NOT_SERIALIZABLE' },
      });
    }

    const isObject = handlerResult && typeof handlerResult === 'object' && !Array.isArray(handlerResult);
    const data = isObject && typeof handlerResult.data !== 'undefined'
      ? handlerResult.data
      : handlerResult;
    const safety = isObject && handlerResult.safety && typeof handlerResult.safety === 'object'
      ? handlerResult.safety
      : {};

    return finish({
      status: 'completed',
      executed: true,
      authorized: true,
      executionAllowed: true,
      data,
      safety: {
        ...safety,
        executionAllowed: true,
        authorized: true,
      },
    });
  } catch (error) {
    if (execSignal?.aborted) {
      return finish({
        status: isTimeoutAbort() ? 'timeout' : 'cancelled',
        authorized: true,
        executionAllowed: true,
        error: {
          code: isTimeoutAbort() ? 'TOOL_TIMEOUT' : 'TOOL_CANCELLED',
          message: isTimeoutAbort() ? 'TOOL_TIMEOUT' : 'TOOL_CANCELLED',
        },
      });
    }
    return finish({
      status: 'error',
      authorized: true,
      executionAllowed: true,
      error: { code: safeErrorCode(error), message: 'TOOL_ERROR' },
    });
  }
}

export function executeToolSync({ tool, toolCall, authorization, timeoutMs = null } = {}) {
  if (!tool || typeof tool.handler !== 'function') {
    return createToolResult({
      toolCallId: toolCall?.id ?? null,
      toolName: toolCall?.name ?? tool?.name ?? null,
      status: 'error',
      error: { code: 'EXECUTOR_TOOL_MISSING', message: 'EXECUTOR_TOOL_MISSING' },
    });
  }
  if (authorization?.authorized !== true || authorization?.executionAllowed !== true) {
    return createToolResult({
      toolCallId: toolCall?.id ?? null,
      toolName: toolCall?.name ?? tool?.name ?? null,
      status: 'unauthorized',
      authorized: Boolean(authorization?.authorized),
      executionAllowed: Boolean(authorization?.executionAllowed),
      error: { code: 'EXECUTOR_UNAUTHORIZED', message: 'EXECUTOR_UNAUTHORIZED' },
    });
  }

  const startedAt = Date.now();
  const finish = (result) => {
    const latencyMs = Date.now() - startedAt;
    return createToolResult({
      ...result,
      toolCallId: result.toolCallId ?? toolCall?.id ?? null,
      toolName: result.toolName ?? toolCall?.name ?? tool?.name ?? null,
      latencyMs,
    });
  };

  try {
    const handlerResult = tool.handler({
      arguments: toolCall?.arguments ?? {},
      signal: null,
      authorization: authorization?.context ?? null,
      toolCallId: toolCall?.id ?? null,
    });
    if (!isSerializableValue(handlerResult)) {
      return finish({
        status: 'error',
        authorized: true,
        executionAllowed: true,
        error: { code: 'RESULT_NOT_SERIALIZABLE', message: 'RESULT_NOT_SERIALIZABLE' },
      });
    }
    const isObject = handlerResult && typeof handlerResult === 'object' && !Array.isArray(handlerResult);
    const data = isObject && typeof handlerResult.data !== 'undefined'
      ? handlerResult.data
      : handlerResult;
    const safety = isObject && handlerResult.safety && typeof handlerResult.safety === 'object'
      ? handlerResult.safety
      : {};
    return finish({
      status: 'completed',
      executed: true,
      authorized: true,
      executionAllowed: true,
      data,
      safety: { ...safety, executionAllowed: true, authorized: true },
    });
  } catch {
    return finish({
      status: 'error',
      authorized: true,
      executionAllowed: true,
      error: { code: 'HANDLER_ERROR', message: 'TOOL_ERROR' },
    });
  }
}

export function createExecutedToolResult({ toolCallId = null, toolName = null, data = null, safety = {} } = {}) {
  return createToolResult({
    toolCallId,
    toolName,
    status: 'completed',
    executed: true,
    authorized: true,
    executionAllowed: true,
    data,
    safety,
  });
}

export function createBlockedToolResult({ toolCallId = null, toolName = null, code = 'BLOCKED' } = {}) {
  return createToolResult({
    toolCallId,
    toolName,
    status: 'blocked',
    error: { code, message: code },
  });
}

export function createEmptyExecutedToolResult() {
  return createEmptyToolResult();
}