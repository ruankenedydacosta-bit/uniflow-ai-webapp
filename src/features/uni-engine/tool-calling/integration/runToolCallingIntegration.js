// Uni Engine — Fase 20.1/20.3: Tool Calling — integração com o pipeline da Uni.
//
// Camada de integração que conecta a tool call bruta da camada OpenAI à
// infraestrutura base da Fase 20 (adaptador → dispatcher → executor), no
// contexto de um turno da Uni.
//
// Garantias (cascata de segurança):
//   - Tool Calling desligado → nenhum dispatcher, nenhuma execução;
//   - sem identidade de turno válida → nenhuma execução;
//   - execução única por mensagem — responsabilidade do CHAMADOR (ver
//     `messageDedupeStore` abaixo); esta função NUNCA guarda estado global
//     de módulo (Fase 20.3: removido `let lastToolCallingMessageId` —
//     estado global compartilhado entre workspaces/conversas/abas violava
//     o isolamento estabelecido na Fase 19.1). O UniChatPage já garante
//     isso com um ref por instância (lastToolCallingProcessedMessageIdRef),
//     verificado ANTES de chamar esta função;
//   - autorização ausente → nenhuma execução (gate do selection/dispatcher);
//   - Pending Action / confirmação pendente → bloqueio preservado;
//   - telemetria sanitizada (sem args brutos, retorno bruto, valores
//     monetários ou IDs crus);
//   - erro interno nunca escapa (falha-segura → resultado vazio).
//
// Produção nunca ativa por acidente: nenhuma ferramenta real de escrita é
// registrada e a integração só roda com flag explícita.
//
// Fase 21 — Narrativa: além do array `results` sanitizado (contrato da Fase
// 20.1, sem `data`, usado por telemetria e outros consumidores externos),
// esta função também produz `responseText` — uma STRING (nunca um objeto)
// construída pela camada de narrativa a partir do primeiro ToolResult
// executado com sucesso. `responseText` é o único lugar onde o dado real de
// uma ferramenta chega perto de virar resposta ao usuário; ele nunca inclui
// JSON, IDs ou metadados — ver buildToolResultNarrativeText.
import { runOpenAiToolCallAdapter, toolResultToPipeline } from '../adapters/index.js';
import { buildToolResultNarrativeText } from '../response/index.js';

function isSerializableList(value) {
  return Array.isArray(value);
}

function buildEmptyResult({
  enabled = false,
  reason,
  turnId = null,
  messageId = null,
  results = [],
} = {}) {
  return {
    enabled: Boolean(enabled),
    shadowMode: false,
    reason: typeof reason === 'string' ? reason : 'NO_TOOL_CALLS',
    executed: false,
    turnId,
    messageId,
    count: results.length,
    results,
    responseText: null,
    serializable: true,
  };
}

// `messageDedupeStore`, quando fornecido, é um objeto com `has(key)`/`add(key)`
// (ex.: um `Set` real, ou o próprio idempotency store do dispatcher via
// adaptador) de propriedade do CHAMADOR — nunca criado ou mantido por este
// módulo. Sem ele, esta função não deduplica por mensagem (o chamador deve
// fazer isso, como o UniChatPage já faz com seu próprio ref).
export async function runToolCallingIntegration(options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const {
    rawToolCalls = null,
    dispatcher = null,
    registry = null,
    config = null,
    authorization = null,
    context = {},
    messageDedupeStore = null,
    conversationStyle = 'simple',
  } = safeOptions;
  const safeConfig = config && typeof config === 'object' ? config : {};
  const safeContext = context && typeof context === 'object' ? context : {};
  const turnId = typeof safeContext.turnId === 'string' && safeContext.turnId !== ''
    ? safeContext.turnId
    : null;
  const messageId = typeof safeContext.messageId === 'string' && safeContext.messageId !== ''
    ? safeContext.messageId
    : null;
  const conversationId = typeof safeContext.conversationId === 'string' && safeContext.conversationId !== ''
    ? safeContext.conversationId
    : null;
  const workspaceId = typeof safeContext.workspaceId === 'string' && safeContext.workspaceId !== ''
    ? safeContext.workspaceId
    : null;
  const environment = typeof safeContext.environment === 'string'
    ? safeContext.environment
    : 'development';

  const safeDedupeStore = messageDedupeStore
    && typeof messageDedupeStore.has === 'function'
    && typeof messageDedupeStore.add === 'function'
    ? messageDedupeStore
    : null;

  // Cascata 1 — Tool Calling desligado: nenhum dispatcher, nenhuma execução.
  if (safeConfig.toolCallingEnabled !== true) {
    return buildEmptyResult({
      enabled: false,
      reason: 'TOOL_CALLING_DISABLED',
      turnId,
      messageId,
    });
  }

  // Cascata 2 — identidade de turno obrigatória para executar.
  if (!turnId) {
    return buildEmptyResult({
      enabled: true,
      reason: 'TURN_IDENTITY_MISSING',
      turnId,
      messageId,
    });
  }

  // Cascata 3 — execução única por mensagem, apenas quando o chamador opta
  // por fornecer um store próprio (ver documentação da função acima).
  if (safeDedupeStore && messageId && safeDedupeStore.has(messageId)) {
    return buildEmptyResult({
      enabled: true,
      reason: 'MESSAGE_ALREADY_ANALYZED',
      turnId,
      messageId,
    });
  }

  const rawList = isSerializableList(rawToolCalls) ? rawToolCalls : [];
  if (rawList.length === 0) {
    if (safeDedupeStore && messageId) safeDedupeStore.add(messageId);
    return buildEmptyResult({
      enabled: true,
      reason: 'NO_TOOL_CALLS',
      turnId,
      messageId,
    });
  }

  const safeDispatcher = dispatcher && typeof dispatcher.dispatchToolCall === 'function'
    ? dispatcher
    : null;
  if (!safeDispatcher) {
    if (safeDedupeStore && messageId) safeDedupeStore.add(messageId);
    // Fase 24 — toolCallingRequired=true torna a indisponibilidade do
    // pipeline um estado explícito e distinguível (reason dedicado), em vez
    // de cair no mesmo DISPATCHER_MISSING silencioso usado quando a
    // execução é opcional. Nunca lança exceção — a falha-segura de todo o
    // módulo (erro nunca escapa) continua valendo; apenas o reason muda,
    // para quem quiser tratar esse caso como erro visível.
    return buildEmptyResult({
      enabled: true,
      reason: safeConfig.toolCallingRequired === true
        ? 'TOOL_CALLING_REQUIRED_UNAVAILABLE'
        : 'DISPATCHER_MISSING',
      turnId,
      messageId,
    });
  }

  const results = [];
  // Fase 21: narrativa é construída a partir do primeiro ToolResult cru
  // (com `data`) executado com sucesso — nunca do array `results` acima,
  // que já chega sanitizado sem `data`. `outcome.result` só existe dentro
  // deste laço; nada bruto sai da função além desta string.
  let responseText = null;
  for (const rawToolCall of rawList) {
    let outcome;
    try {
      outcome = await runOpenAiToolCallAdapter({
        rawToolCall,
        dispatcher: safeDispatcher,
        registry,
        config: safeConfig,
        authorization,
        turnId,
        workspaceId,
        conversationId,
        environment,
      });
    } catch {
      outcome = { ok: false, error: 'ADAPTER_FAILED', pipeline: null };
    }
    if (outcome?.pipeline) {
      results.push(outcome.pipeline);
    } else {
      results.push({
        toolCallId: null,
        toolName: null,
        status: 'error',
        executed: false,
        authorized: false,
        executionAllowed: false,
        idempotent: false,
        hasData: false,
        errorCode: outcome?.error ?? 'ADAPTER_FAILED',
        serializable: true,
      });
    }
    if (responseText === null && outcome?.ok) {
      try {
        responseText = buildToolResultNarrativeText(outcome.result, { conversationStyle });
      } catch {
        responseText = null;
      }
    }
  }

  if (safeDedupeStore && messageId) safeDedupeStore.add(messageId);

  return {
    enabled: true,
    shadowMode: Boolean(safeConfig.toolCallingShadowMode),
    reason: 'TOOL_CALLS_PROCESSED',
    executed: results.some((r) => r.executed),
    responseText,
    turnId,
    messageId,
    count: results.length,
    results,
    serializable: true,
  };
}

export function toolResultToPipelineSafe(result) {
  return toolResultToPipeline(result);
}
