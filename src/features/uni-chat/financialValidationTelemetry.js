// Sprint 4 Ciclo 4 (Bloco 4.9) — infraestrutura de telemetria DEV para
// preparar a validação real da OpenAI (financial_intent +
// financial_response_compose), SEM realizar nenhuma chamada real e SEM
// alterar nenhum comportamento do sistema.
//
// Este módulo é um agregador PURO em memória: só acumula números a
// partir de eventos que o chamador já calculou (nunca decide nada, nunca
// altera o fluxo, nunca é lido pelo motor determinístico ou pelo
// orquestrador). Existe unicamente para dar visibilidade ao
// desenvolvedor, em DEV, sobre:
//   - taxa de sucesso do composer (respostas da LLM que passaram nos
//     guardrails / total de tentativas);
//   - latência (média e p95);
//   - custo estimado (a partir de tokens REAIS devolvidos pela Edge
//     Function -- nunca estimado por adivinhação; usa `usage` real já
//     repassado pelos serviços client-side desde este mesmo ciclo);
//   - quantidade de chamadas LLM por turno;
//   - taxa de fallback (para o texto determinístico);
//   - taxa de bloqueio por guardrail, discriminada por motivo (número
//     inventado, entidade fora de escopo, entidade inventada, etc.);
//   - tempo médio de resposta;
//   - distribuição de modos usados (financial_intent vs
//     financial_response_compose vs legado).
//
// Estado module-level, resetável, nunca persistido (não é salvo em
// localStorage/DB) -- morre com a aba, exatamente como qualquer variável
// de telemetria DEV já existente no projeto (ex.:
// financialOrchestratorTelemetry.js).
function createEmptyState() {
  return {
    totalEvents: 0,
    totalLlmCalls: 0,
    composerAttempts: 0,
    composerSuccesses: 0,
    fallbacks: 0,
    guardrailBlocksByReason: {},
    latenciesMs: [],
    modesUsed: {},
    promptTokens: 0,
    completionTokens: 0,
  };
}

let state = createEmptyState();

function safeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

// Registra UM evento (uma chamada LLM concluída -- interpretação OU
// composição). Nunca lança; silenciosamente ignora fora de DEV (mesmo
// guard já usado em financialOrchestratorTelemetry.js) -- ligar/desligar
// esta telemetria nunca muda o texto publicado ao usuário nem o caminho
// de execução, só o que fica visível no agregador em memória.
export function recordFinancialValidationEvent(event, { isDev = false } = {}) {
  if (!isDev) return;
  try {
    const {
      mode = null,
      llmCallCount = 0,
      durationMs = null,
      composerUsed = null,
      fallbackReason = null,
      usage = null,
    } = event || {};
    state.totalEvents += 1;
    state.totalLlmCalls += safeNumber(llmCallCount);

    if (typeof mode === 'string' && mode) {
      state.modesUsed[mode] = (state.modesUsed[mode] ?? 0) + 1;
    }
    if (Number.isFinite(durationMs)) {
      state.latenciesMs.push(durationMs);
    }
    // composerUsed !== null sinaliza que uma tentativa de composição via
    // LLM de fato ocorreu neste evento (distinto de eventos só de
    // interpretação, onde composerUsed fica null e não conta para a taxa
    // de sucesso/fallback do composer).
    if (composerUsed !== null) {
      state.composerAttempts += 1;
      if (composerUsed === true) {
        state.composerSuccesses += 1;
      } else {
        state.fallbacks += 1;
        if (typeof fallbackReason === 'string' && fallbackReason.startsWith('GUARDRAIL_FAILED')) {
          state.guardrailBlocksByReason[fallbackReason] = (state.guardrailBlocksByReason[fallbackReason] ?? 0) + 1;
        }
      }
    }
    if (usage) {
      state.promptTokens += safeNumber(usage.promptTokens);
      state.completionTokens += safeNumber(usage.completionTokens);
    }
  } catch {
    // Telemetria nunca pode quebrar o fluxo do usuário.
  }
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

// Custo estimado -- SÓ calculado se o chamador fornecer uma tabela de
// preço real (USD por 1 milhão de tokens do modelo configurado). Sem
// tabela, devolve null: esta função nunca inventa um preço. A tabela real
// deve ser confirmada contra o modelo efetivamente configurado na Edge
// Function antes de qualquer decisão de custo real (ver relatório final,
// seção de riscos residuais).
function estimateCostUsd(promptTokens, completionTokens, pricing) {
  if (!pricing || !Number.isFinite(pricing.inputPerMillionUsd) || !Number.isFinite(pricing.outputPerMillionUsd)) {
    return null;
  }
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillionUsd;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

// Snapshot imutável do estado acumulado até agora. Nunca lança.
export function getFinancialValidationTelemetrySnapshot({ pricing = null } = {}) {
  const attempts = state.composerAttempts;
  return Object.freeze({
    totalEvents: state.totalEvents,
    totalLlmCalls: state.totalLlmCalls,
    avgLlmCallsPerEvent: state.totalEvents ? state.totalLlmCalls / state.totalEvents : null,
    composerAttempts: attempts,
    composerSuccessRate: attempts ? state.composerSuccesses / attempts : null,
    fallbackRate: attempts ? state.fallbacks / attempts : null,
    guardrailBlockRate: attempts
      ? Object.values(state.guardrailBlocksByReason).reduce((a, b) => a + b, 0) / attempts
      : null,
    guardrailBlocksByReason: Object.freeze({ ...state.guardrailBlocksByReason }),
    avgLatencyMs: average(state.latenciesMs),
    p95LatencyMs: percentile(state.latenciesMs, 0.95),
    modesUsed: Object.freeze({ ...state.modesUsed }),
    totalPromptTokens: state.promptTokens,
    totalCompletionTokens: state.completionTokens,
    estimatedCostUsd: estimateCostUsd(state.promptTokens, state.completionTokens, pricing),
  });
}

// Zera o agregador (útil entre sessões de teste manual em DEV). Nunca
// afeta produção -- o próprio estado só é escrito quando isDev=true.
export function resetFinancialValidationTelemetry() {
  state = createEmptyState();
}
