// Shadow Mode do Uni Engine (Fase 1).
//
// runUniEngineShadow(input, options):
//   1. validar entrada;
//   2. normalizar mensagem;
//   3. analisar contexto;
//   4. classificar cognitivamente;
//   5. construir estado epistêmico;
//   6. criar plano;
//   7. validar plano;
//   8. comparar com o pipeline atual;
//   9. gerar telemetria (redigida);
//   10. retornar resultado SOMENTE para diagnóstico — sempre descartável.
//
// Garantias:
//   - nunca lança erro que quebre o chat (try/catch interno);
//   - sem rede, sem LLM, sem Supabase, sem executor, sem voz;
//   - síncrono e leve (meta < 20 ms para entradas comuns);
//   - com enabled=false o motor nem roda;
//   - o pipeline atual continua intocado.
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
    diagnostics: {
      rulesUsed: [],
      ambiguities: [],
      fallbackUsed: false,
      errorCode: 'ENGINE_DISABLED',
      latencyMs,
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

    const plan = createCognitivePlan(input, {
      normalized,
      analyzed,
      classification,
      epistemic: epistemicState,
    });

    const validation = validateCognitivePlan(input, {
      analyzed,
      classification,
      epistemic: epistemicState,
      plan,
    });

    const comparison = compareShadowDecision(
      {
        classification,
        plan,
        diagnostics: { fallbackUsed: classification.fallbackUsed },
      },
      {
        detectedIntent: input.currentPipeline?.detectedIntent ?? null,
        pendingIntent: input.currentPipeline?.pendingIntent ?? null,
        pendingActive: Boolean(input.currentPipeline?.pendingActive),
        resultType: input.currentPipeline?.resultType ?? 'unknown',
      },
    );

    const latencyMs = nowMillis() - start;

    if (config.telemetryEnabled) {
      const telemetry = buildUniEngineTelemetry({
        correlationId,
        classification,
        plan,
        validation,
        comparison,
        diagnostics: {
          fallbackUsed: classification.fallbackUsed,
        },
        latencyMs,
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
      plan,
      validation,
      shadowComparison: comparison,
      diagnostics: {
        rulesUsed: classification.rulesUsed ?? [],
        ambiguities: classification.ambiguities ?? [],
        fallbackUsed: classification.fallbackUsed ?? false,
        errorCode: null,
        latencyMs,
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
