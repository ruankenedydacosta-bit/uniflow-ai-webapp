// Shadow Mode do Uni Engine (Fase 1 + Fase 2 — Integração Cognitiva Assistida).
//
// runUniEngineShadow(input, options):
//   1. validar entrada;
//   2. normalizar mensagem;
//   3. analisar contexto;
//   4. classificar cognitivamente;
//   5. construir estado epistêmico;
//   6. resolver referências implícitas (Fase 2);
//   7. construir contexto cognitivo (Fase 2);
//   8. criar plano (Fase 1) e expandir com predições cognitivas (Fase 2);
//   9. validar plano;
//   10. comparar com o pipeline atual;
//   11. diagnosticar divergências (Fase 2 — registra, nunca altera);
//   12. calcular métricas de concordância (Fase 2);
//   13. montar sugestões estruturadas (Fase 2 — apenas disponibilizadas);
//   14. atualizar memória operacional injetada (Fase 2);
//   15. gerar telemetria (redigida);
//   16. retornar resultado SOMENTE para diagnóstico — sempre descartável.
//
// Garantias:
//   - nunca lança erro que quebre o chat (try/catch interno);
//   - sem rede, sem LLM, sem Supabase, sem executor, sem voz;
//   - síncrono e leve (meta < 20 ms para entradas comuns);
//   - com enabled=false o motor nem roda;
//   - o pipeline atual continua intocado — o motor NUNCA executa, NUNCA
//     confirma, NUNCA responde; apenas produz inteligência.
import {
  createCorrelationId,
  createEmptyUniEngineResult,
  UNI_ENGINE_VERSION,
  validateUniEngineInput,
} from './uniEngineContracts.js';
import {
  UNI_ENGINE_DEFAULT_CONFIG,
  isUniEngineShadowEnabled,
} from './uniEngineConfig.js';
import { normalizeUserMessage } from './normalizeUserMessage.js';
import { analyzeConversationContext } from './analyzeConversationContext.js';
import { classifyCognitiveIntent } from './classifyCognitiveIntent.js';
import { buildEpistemicState } from './buildEpistemicState.js';
import { createCognitivePlan } from './createCognitivePlan.js';
import { validateCognitivePlan } from './validateCognitivePlan.js';
import { compareShadowDecision } from './compareShadowDecision.js';
import {
  buildUniEngineTelemetry,
  emitUniEngineTelemetry,
} from './telemetry/uniEngineTelemetry.js';
// Fase 2 — Integração Cognitiva Assistida (camada de inteligência sobre o
// mesmo ponto de entrada; nada aqui executa ou altera o pipeline).
import {
  buildMemoryPatch,
  readOperationalMemory,
  updateOperationalMemory,
} from './operationalMemory.js';
import { resolveImplicitReference } from './resolveImplicitReference.js';
import { buildCognitiveContext } from './buildCognitiveContext.js';
import { expandCognitivePlan } from './expandCognitivePlan.js';
import { buildEngineSuggestions } from './buildEngineSuggestions.js';
import { buildDivergenceDiagnostics } from './buildDivergenceDiagnostics.js';
import { computeAgreementMetrics } from './computeAgreementMetrics.js';

function nowMillis() {
  if (typeof performance?.now === 'function') return performance.now();
  return Date.now();
}

function safeCorrelationId(options) {
  return typeof options?.correlationId === 'string' && options.correlationId.trim()
    ? options.correlationId
    : createCorrelationId();
}

function buildDisabledResult({ correlationId, latencyMs }) {
  return {
    engineVersion: UNI_ENGINE_VERSION,
    correlationId,
    enabled: false,
    skipped: true,
    normalizedMessage: null,
    classification: null,
    epistemicState: null,
    plan: null,
    validation: null,
    shadowComparison: null,
    cognitiveContext: null,
    referenceResolution: null,
    suggestions: null,
    agreementMetrics: null,
    divergenceDiagnostics: [],
    operationalMemory: null,
    diagnostics: {
      rulesUsed: [],
      ambiguities: [],
      fallbackUsed: false,
      errorCode: 'ENGINE_DISABLED',
      latencyMs,
      divergenceCount: 0,
    },
  };
}

function buildSafeErrorResult({ correlationId, error, latencyMs, isDev }) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] shadow error: ${error?.code ?? 'UNKNOWN_ERROR'}`);
  }
  return {
    ...createEmptyUniEngineResult({ correlationId }),
    diagnostics: {
      ...createEmptyUniEngineResult({ correlationId }).diagnostics,
      errorCode: error?.code ?? 'UNKNOWN_ERROR',
      fallbackUsed: true,
      latencyMs,
    },
  };
}

export function runUniEngineShadow(input, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const config = safeOptions.config ?? UNI_ENGINE_DEFAULT_CONFIG;
  const correlationId = safeCorrelationId(safeOptions);
  const start = nowMillis();
  const isDev = Boolean(safeOptions.isDev);

  // Fase 2 — memória operacional é um objeto TEMPORÁRIO injetado pelo
  // chamador (dura somente enquanto a conversa está ativa). Nunca persistida.
  const operationalMemory =
    safeOptions.operationalMemory != null && typeof safeOptions.operationalMemory === 'object'
      ? safeOptions.operationalMemory
      : null;

  if (!config?.enabled || !isUniEngineShadowEnabled(config)) {
    return buildDisabledResult({
      correlationId,
      latencyMs: nowMillis() - start,
    });
  }

  try {
    const inputValidation = validateUniEngineInput(input);
    if (!inputValidation.valid) {
      return buildSafeErrorResult({
        correlationId,
        error: { code: inputValidation.errors[0] ?? 'INVALID_INPUT' },
        latencyMs: nowMillis() - start,
        isDev,
      });
    }

    const normalized = normalizeUserMessage(input.message, {
      referenceDate: input.context?.financialSnapshot?.referenceDate ?? null,
    });

    const analyzed = analyzeConversationContext(input);

    const classification = classifyCognitiveIntent(input, {
      normalized,
      analyzed,
    });

    const epistemicState = buildEpistemicState(input, {
      normalized,
      analyzed,
      classification,
    });

    // Fase 2 — resolução de referências implícitas e contexto cognitivo.
    // Usam somente contexto atual + histórico recente + FinancialSnapshot
    // (+ memória operacional quando injetada). Nunca LLM.
    const referenceResolution = resolveImplicitReference(input, {
      analyzed,
      epistemic: epistemicState,
      memory: operationalMemory,
    });

    const cognitiveContext = buildCognitiveContext(input, {
      analyzed,
      classification,
      epistemic: epistemicState,
      referenceResolution,
      memory: operationalMemory,
    });

    const plan = createCognitivePlan(input, {
      normalized,
      analyzed,
      classification,
      epistemic: epistemicState,
    });

    // Fase 2 — expansão do plano (planejamento cognitivo completo): executor
    // esperado, dados disponíveis/ausentes, risco, ambiguidades, alternativas.
    const expandedPlan = expandCognitivePlan(plan, {
      classification,
      epistemic: epistemicState,
      referenceResolution,
      cognitiveContext,
    });

    const validation = validateCognitivePlan(input, {
      analyzed,
      classification,
      epistemic: epistemicState,
      plan: expandedPlan,
    });

    const comparison = compareShadowDecision(
      {
        classification,
        plan: expandedPlan,
        diagnostics: { fallbackUsed: classification.fallbackUsed },
      },
      {
        detectedIntent: input.currentPipeline?.detectedIntent ?? null,
        pendingIntent: input.currentPipeline?.pendingIntent ?? null,
        pendingActive: Boolean(input.currentPipeline?.pendingActive),
        resultType: input.currentPipeline?.resultType ?? 'unknown',
      },
    );

    // Fase 2 — diagnóstico de divergências (registra tudo, nunca altera o
    // comportamento) e métricas de concordância.
    const divergenceDiagnostics = buildDivergenceDiagnostics({
      comparison,
      classification,
      plan: expandedPlan,
      epistemic: epistemicState,
      referenceResolution,
      cognitiveContext,
      analyzed,
      input,
      memory: operationalMemory,
    });

    const latencyMs = nowMillis() - start;

    const agreementMetrics = computeAgreementMetrics({
      comparison,
      classification,
      plan: expandedPlan,
      referenceResolution,
      cognitiveContext,
      pipeline: input.currentPipeline ?? null,
      divergences: divergenceDiagnostics,
      latencyMs,
    });

    // Fase 2 — sugestões estruturadas para o pipeline. Nesta fase NÃO são
    // utilizadas automaticamente — somente disponibilizadas.
    const suggestions = buildEngineSuggestions({
      classification,
      plan: expandedPlan,
      epistemic: epistemicState,
      referenceResolution,
      analyzed,
    });

    // Fase 2 — atualização da memória operacional (somente rodadas válidas;
    // memória nula = nenhuma atualização).
    if (operationalMemory) {
      const memoryPatch = buildMemoryPatch({
        classification,
        plan: expandedPlan,
        epistemic: epistemicState,
        referenceResolution,
        cognitiveContext,
        messageText: input.message?.text ?? null,
        lastUniMessage: analyzed.history.lastUniMessage ?? null,
        snapshot: input.context?.financialSnapshot ?? null,
        memory: operationalMemory,
      });
      updateOperationalMemory(operationalMemory, memoryPatch);
    }

    if (config.telemetryEnabled) {
      const telemetry = buildUniEngineTelemetry({
        correlationId,
        classification,
        plan: expandedPlan,
        validation,
        comparison,
        diagnostics: {
          fallbackUsed: classification.fallbackUsed,
        },
        latencyMs,
        metrics: agreementMetrics,
      });
      emitUniEngineTelemetry(telemetry, safeOptions.telemetryAdapter ?? null);
    }

    return {
      engineVersion: UNI_ENGINE_VERSION,
      correlationId,
      enabled: true,
      skipped: false,
      normalizedMessage: normalized,
      classification,
      epistemicState,
      plan: expandedPlan,
      validation,
      shadowComparison: comparison,
      cognitiveContext,
      referenceResolution,
      suggestions,
      agreementMetrics,
      divergenceDiagnostics,
      operationalMemory: operationalMemory
        ? readOperationalMemory(operationalMemory)
        : null,
      diagnostics: {
        rulesUsed: classification.rulesUsed ?? [],
        ambiguities: classification.ambiguities ?? [],
        fallbackUsed: classification.fallbackUsed ?? false,
        errorCode: null,
        latencyMs,
        divergenceCount: divergenceDiagnostics.length,
      },
    };
  } catch (error) {
    const message = error?.message ?? String(error);
    return buildSafeErrorResult({
      correlationId,
      error: { code: 'ENGINE_INTERNAL_ERROR', message },
      latencyMs: nowMillis() - start,
      isDev,
    });
  }
}
