// Uni Engine — Fase 20.1: Tool Calling — adaptador OpenAI.
//
// Camada de borda entre o formato bruto de tool call da camada OpenAI
// existente (Chat Completions API: { id, type, function: { name, arguments } })
// e o contrato interno da Fase 20. O adaptador:
//   - valida id/nome e interpreta `arguments` (JSON) de forma fail-safe;
//   - converte para o contrato interno ({ id, name, arguments });
//   - chama EXCLUSIVAMENTE o dispatcher (ponto único de execução);
//   - converte o ToolResult em um formato seguro para o pipeline;
//   - nunca acessa handlers, nunca faz rede e nunca cria cliente OpenAI.
//
// Garantias:
//   - erro nunca escapa (qualquer falha → { ok:false, error } fail-safe);
//   - nenhum argumento bruto nem dado retornado vaza para fora do pipeline;
//   - sem dispatcher → nenhuma execução (falha segura).
import {
  createEmptyToolResult,
  isSerializableValue,
  isToolResultSerializable,
} from '../contracts/index.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isArgumentsShape(value) {
  return isPlainObject(value) || Array.isArray(value);
}

// Interpreta o formato bruto de tool call da OpenAI para o contrato interno.
// `arguments` chega como string JSON — parse é fail-safe: qualquer JSON
// inválido ou formato não serializável → erro, nunca execução.
export function parseOpenAiToolCall(rawToolCall) {
  if (!rawToolCall || typeof rawToolCall !== 'object') {
    return { ok: false, error: 'RAW_TOOL_CALL_INVALID' };
  }
  const id = typeof rawToolCall.id === 'string' ? rawToolCall.id.trim() : '';
  const functionPart = isPlainObject(rawToolCall.function) ? rawToolCall.function : null;
  const name = functionPart && typeof functionPart.name === 'string' ? functionPart.name.trim() : '';
  if (!id) return { ok: false, error: 'TOOL_CALL_ID_MISSING' };
  if (!name) return { ok: false, error: 'TOOL_CALL_NAME_MISSING' };

  const rawArguments = functionPart && typeof functionPart.arguments === 'string'
    ? functionPart.arguments.trim()
    : '';
  let argumentsValue = {};
  if (rawArguments) {
    let parsed;
    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      return { ok: false, error: 'TOOL_CALL_ARGUMENTS_JSON_INVALID' };
    }
    if (!isArgumentsShape(parsed) || !isSerializableValue(parsed)) {
      return { ok: false, error: 'TOOL_CALL_ARGUMENTS_INVALID' };
    }
    argumentsValue = parsed;
  }

  return { ok: true, toolCall: { id, name, arguments: argumentsValue } };
}

// Converte o ToolResult padronizado em um formato seguro para o pipeline do
// chat. Nunca expõe argumentos brutos nem conteúdo retornado bruto — apenas
// metadados sanitizados e flags de segurança.
export function toolResultToPipeline(result) {
  const safe = result && typeof result === 'object' ? result : createEmptyToolResult();
  return Object.freeze({
    toolCallId: typeof safe.toolCallId === 'string' ? safe.toolCallId : null,
    toolName: typeof safe.toolName === 'string' ? safe.toolName : null,
    status: typeof safe.status === 'string' ? safe.status : 'idle',
    executed: Boolean(safe.executed),
    authorized: Boolean(safe.authorized),
    executionAllowed: Boolean(safe.executionAllowed),
    idempotent: Boolean(safe.idempotent),
    hasData: safe.data !== null && safe.data !== undefined,
    errorCode: safe.error && typeof safe.error.code === 'string' ? safe.error.code : null,
    serializable: isToolResultSerializable(safe),
  });
}

// Único ponto de entrada do adaptador: interpreta o formato bruto, converte
// para o contrato interno e delega ao dispatcher. Falha segura: sem
// dispatcher válido, sem tool call válida ou erro interno → nunca escapa.
export async function runOpenAiToolCallAdapter({
  rawToolCall,
  dispatcher,
  registry,
  config,
  authorization,
  turnId = null,
  workspaceId = null,
  conversationId = null,
  environment = 'development',
} = {}) {
  const safeDispatcher = dispatcher && typeof dispatcher.dispatchToolCall === 'function'
    ? dispatcher
    : null;
  if (!safeDispatcher) {
    return { ok: false, error: 'DISPATCHER_MISSING' };
  }
  const parsed = parseOpenAiToolCall(rawToolCall);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, toolCall: null };
  }
  let outcome;
  try {
    outcome = await safeDispatcher.dispatchToolCall({
      toolCall: parsed.toolCall,
      registry,
      config,
      authorization,
      turnId,
      workspaceId,
      conversationId,
      environment,
    });
  } catch {
    return { ok: false, error: 'ADAPTER_DISPATCH_FAILED', toolCall: parsed.toolCall };
  }
  return {
    ok: true,
    toolCall: parsed.toolCall,
    result: outcome?.result ?? null,
    selection: outcome?.selection ?? null,
    executed: Boolean(outcome?.executed),
    idempotent: Boolean(outcome?.idempotent),
    safeText: typeof outcome?.safeText === 'string' ? outcome.safeText : 'TOOL_CALL_ERROR',
    pipeline: toolResultToPipeline(outcome?.result),
  };
}
