// Integration — orquestração (Parte 1: integração segura e controlada).
//
// runUniEngineIntegration({ config, legacy, engineResult, context }):
//   1. valida entrada e config (flags de integração + engine + activation);
//   2. normaliza o pipeline legado (adapter);
//   3. avalia as decisões da Activation Engine (defesa em profundidade);
//   4. deriva sugestões a partir do resultado da Uni Engine;
//   5. aplica SOMENTE orientações autorizadas (pergunta, esclarecimento,
//      estilo, comprimento, metadata, diagnóstico);
//   6. monta o resultado serializável; qualquer erro → fallback imediato
//      ao pipeline legado (texto legado 100% preservado).
//
// Garantias:
//   - execução financeira NUNCA é propriedade desta camada;
//   - nenhuma resposta completa é substituída — apenas trocas entre
//     templates fechados e redução segura de comprimento;
//   - nenhuma memória é escrita, nenhum aprendizado é aplicado;
//   - o resultado é serializável, sem funções, sem clientes externos.
import {
  createEmptyIntegrationResult,
  createIntegrationResult,
  validateIntegrationResult,
} from './integrationContracts.js';
import {
  INTEGRATION_VERSION,
} from './integrationTypes.js';
import { INTEGRATION_POLICY } from './integrationPolicy.js';
import { buildLegacyPipelineAdapter } from './legacyPipelineAdapter.js';
import { evaluateEngineInfluence, resolveIntegrationStatus } from './evaluateEngineInfluence.js';
import { applyQuestionGuidance } from './applyQuestionGuidance.js';
import { applyClarificationGuidance } from './applyClarificationGuidance.js';
import { applyResponseStyleGuidance } from './applyResponseStyleGuidance.js';
import { applyResponseLengthGuidance } from './applyResponseLengthGuidance.js';
import { buildIntegrationDiagnostics } from './buildIntegrationDiagnostics.js';
import {
  buildIntegrationTelemetry,
  emitIntegrationTelemetry,
} from './telemetry/integrationTelemetry.js';
import { getCapabilityConfidenceThreshold } from '../activation/capabilityRegistry.js';
import { isRiskAllowed } from '../activation/activationPolicy.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

// Sugestões estruturadas derivadas do resultado da Uni Engine, espelhando o
// que a Activation já avaliou (buildActivationSuggested) — a integração é a
// consumidora autoritativa e re-deriva para não depender de campos internos
// da decisão.
export function buildIntegrationSuggested(capability, engineResult) {
  const engine = safeObject(engineResult);
  const decisionLayer = safeObject(engine.decisionLayer);
  const comparison = safeObject(engine.comparison);
  const classification = safeObject(engine.classification);
  const ambiguities = Array.isArray(classification.ambiguities) ? classification.ambiguities : [];
  const missingFields = Array.isArray(comparison.missingFields) ? comparison.missingFields : [];
  switch (capability) {
    case 'QUESTION_GUIDANCE':
      return {
        questionKey: decisionLayer.nextDecisionType === 'ask' ? 'missing_field' : null,
        fieldsStillMissing: missingFields.slice(0, INTEGRATION_POLICY.maxFieldsStillMissing),
      };
    case 'CLARIFICATION_GUIDANCE':
      return {
        clarificationKey: ambiguities.length > 0 ? 'ambiguous_intent' : null,
        ambiguityType: ambiguities[0]?.type ?? null,
        optionsCount: Math.min(ambiguities.length, 8),
      };
    case 'RESPONSE_STYLE_GUIDANCE':
      return {
        styleKey: decisionLayer.decisionType === 'respond' ? 'concise' : null,
        toneBand: 'neutral',
      };
    case 'RESPONSE_LENGTH_GUIDANCE':
      return {
        lengthBand: decisionLayer.decisionType === 'respond' ? 'short' : null,
      };
    case 'METADATA_ONLY':
      return {
        hasData: Boolean(engine.enabled),
        intentBand: classification.primaryIntent ?? null,
        engineVersion: INTEGRATION_VERSION,
      };
    case 'DIAGNOSTICS_ONLY':
      return {
        divergenceCount: Number(comparison.agreementMetrics?.divergenceCount ?? 0),
      };
    default:
      return null;
  }
}

function buildDisabledResult({ legacy, latencyMs, reason }) {
  return createEmptyIntegrationResult({
    enabled: false,
    finalText: legacy?.text ?? null,
    fallbackReason: reason,
    latencyMs,
  });
}

function buildFallbackResult({ legacy, latencyMs, reason, requested = [], evaluation = null }) {
  const result = createIntegrationResult({
    enabled: true,
    status: 'fallback',
    finalText: legacy?.text ?? null,
    fallbackUsed: true,
    fallbackReason: reason,
    capabilitiesRequested: requested,
    legacyPreserved: true,
    latencyMs,
  });
  const diagnostics = buildIntegrationDiagnostics({
    evaluation,
    fallbackUsed: true,
    fallbackReason: reason,
  });
  return { ...result, diagnostics };
}

export function runUniEngineIntegration({
  config = null,
  legacy = null,
  engineResult = null,
  context = null,
} = {}) {
  const start = nowMillis();
  const safeConfig = safeObject(config);
  const safeContext = safeObject(context);
  const isDev = Boolean(safeContext.isDev);

  try {
    const engineEnabled = Boolean(safeConfig.enabled);
    const integrationEnabled = Boolean(safeConfig.integrationEnabled);
    if (!engineEnabled || !integrationEnabled) {
      return buildDisabledResult({
        legacy,
        latencyMs: nowMillis() - start,
        reason: integrationEnabled ? 'ENGINE_DISABLED' : 'INTEGRATION_DISABLED',
      });
    }

    const legacyAdapter = buildLegacyPipelineAdapter(legacy);
    if (!legacyAdapter) {
      return buildFallbackResult({
        legacy,
        latencyMs: nowMillis() - start,
        reason: 'LEGACY_INVALID',
      });
    }

    const engine = safeObject(engineResult);
    const decisions = Array.isArray(engine.activation?.decisions)
      ? engine.activation.decisions
      : Array.isArray(safeContext.activationDecisions)
        ? safeContext.activationDecisions
        : [];

    const shadowMode = Boolean(safeConfig.integrationShadowMode);
    const evaluation = evaluateEngineInfluence({
      decisions,
      shadowMode,
    });
    const requested = evaluation.requested;
    if (requested.length === 0) {
      const reason = decisions.length === 0
        ? 'ACTIVATION_DECISIONS_MISSING'
        : 'CAPABILITY_NOT_AUTHORIZED';
      return buildFallbackResult({
        legacy: legacyAdapter,
        latencyMs: nowMillis() - start,
        reason,
        evaluation,
        engineResult: engine,
      });
    }

    // Defesa em profundidade: confiança/risco/dados insuficientes derrubam a
    // integração mesmo com decisão ativa da Activation.
    const confidence = typeof safeContext.confidence === 'number' ? safeContext.confidence : null;
    const risk = typeof safeContext.risk === 'string' ? safeContext.risk : null;
    const dataSufficient = safeContext.dataSufficient !== false;
    for (const capability of evaluation.active) {
      if (confidence !== null && confidence < getCapabilityConfidenceThreshold(capability)) {
        return buildFallbackResult({
          legacy: legacyAdapter,
          latencyMs: nowMillis() - start,
          reason: 'CONFIDENCE_INSUFFICIENT',
          requested,
          evaluation,
          engineResult: engine,
        });
      }
      if (risk !== null && !isRiskAllowed(risk)) {
        return buildFallbackResult({
          legacy: legacyAdapter,
          latencyMs: nowMillis() - start,
          reason: 'RISK_EXCESSIVE',
          requested,
          evaluation,
          engineResult: engine,
        });
      }
      if (!dataSufficient) {
        return buildFallbackResult({
          legacy: legacyAdapter,
          latencyMs: nowMillis() - start,
          reason: 'CONTEXT_INSUFFICIENT',
          requested,
          evaluation,
          engineResult: engine,
        });
      }
    }

    // Aplica cada capacidade ativa. Em Shadow Mode nada é aplicado — apenas
    // avaliado (applied permanece false, texto legado preservado).
    let finalText = legacyAdapter.text;
    const capabilitiesApplied = [];
    let questionGuidance = null;
    let clarificationGuidance = null;
    let styleGuidance = null;
    let lengthGuidance = null;

    const activeSet = new Set(evaluation.active);

    if (activeSet.has('QUESTION_GUIDANCE')) {
      const outcome = applyQuestionGuidance({
        legacy: legacyAdapter,
        suggested: buildIntegrationSuggested('QUESTION_GUIDANCE', engine),
        active: !shadowMode,
      });
      questionGuidance = outcome.guidance;
      if (outcome.guidance.applied) {
        finalText = outcome.finalText;
        capabilitiesApplied.push('QUESTION_GUIDANCE');
      }
    }

    if (activeSet.has('CLARIFICATION_GUIDANCE')) {
      const outcome = applyClarificationGuidance({
        legacy: legacyAdapter,
        suggested: buildIntegrationSuggested('CLARIFICATION_GUIDANCE', engine),
        active: !shadowMode,
      });
      clarificationGuidance = outcome.guidance;
      if (outcome.guidance.applied) {
        finalText = outcome.finalText;
        capabilitiesApplied.push('CLARIFICATION_GUIDANCE');
      }
    }

    if (activeSet.has('RESPONSE_STYLE_GUIDANCE')) {
      const outcome = applyResponseStyleGuidance({
        legacy: legacyAdapter,
        suggested: buildIntegrationSuggested('RESPONSE_STYLE_GUIDANCE', engine),
        active: !shadowMode,
      });
      styleGuidance = outcome.guidance;
      if (outcome.guidance.applied && styleGuidance?.styleKey) {
        capabilitiesApplied.push('RESPONSE_STYLE_GUIDANCE');
      }
    }

    if (activeSet.has('RESPONSE_LENGTH_GUIDANCE')) {
      const outcome = applyResponseLengthGuidance({
        legacy: legacyAdapter,
        suggested: buildIntegrationSuggested('RESPONSE_LENGTH_GUIDANCE', engine),
        active: !shadowMode,
      });
      lengthGuidance = outcome.guidance;
      if (outcome.guidance.applied) {
        finalText = outcome.finalText;
        capabilitiesApplied.push('RESPONSE_LENGTH_GUIDANCE');
      }
    }

    // METADATA_ONLY / DIAGNOSTICS_ONLY: anexadas internamente para auditoria;
    // nunca alteram texto e nunca são exibidas ao usuário.
    if (activeSet.has('METADATA_ONLY')) {
      capabilitiesApplied.push('METADATA_ONLY');
    }
    if (activeSet.has('DIAGNOSTICS_ONLY')) {
      capabilitiesApplied.push('DIAGNOSTICS_ONLY');
    }

    const textChanged = finalText !== legacyAdapter.text;
    const status = resolveIntegrationStatus(evaluation, false);
    const blockedBy = {};
    for (const capability of requested) {
      const entry = evaluation.byCapability[capability];
      if (entry && !entry.active) blockedBy[capability] = entry.blockedBy;
    }
    const diagnostics = buildIntegrationDiagnostics({
      evaluation,
      appliedCapabilities: capabilitiesApplied,
      blockedBy,
      protectedResponses: legacyAdapter.protectedType ? [legacyAdapter.responseType] : [],
    });

    const shadowComparison = {
      mode: shadowMode ? 'shadow' : 'active',
      divergenceCount: Number(engine.comparison?.agreementMetrics?.divergenceCount ?? 0),
      decisionCount: requested.length,
    };

    let telemetry = null;
    if (safeConfig.integrationTelemetryEnabled) {
      telemetry = buildIntegrationTelemetry({
        enabled: true,
        shadowMode,
        status,
        applied: textChanged,
        capabilitiesRequested: requested,
        capabilitiesApplied,
        responseType: legacyAdapter.responseType,
        legacyPreserved: !textChanged,
        fallbackUsed: false,
        questionApplied: questionGuidance?.applied === true,
        clarificationApplied: clarificationGuidance?.applied === true,
        styleApplied: styleGuidance?.applied === true,
        lengthApplied: lengthGuidance?.applied === true,
        styleKey: styleGuidance?.styleKey ?? null,
        lengthBand: lengthGuidance?.lengthBand ?? null,
        latencyMs: nowMillis() - start,
      });
      emitIntegrationTelemetry(telemetry, safeContext.telemetryAdapter ?? null);
    }

    const result = createIntegrationResult({
      enabled: true,
      status,
      applied: textChanged,
      capabilitiesRequested: requested,
      capabilitiesApplied,
      legacyPreserved: !textChanged,
      finalText,
      questionGuidance,
      clarificationGuidance,
      styleGuidance,
      lengthGuidance,
      diagnostics,
      fallbackUsed: false,
      shadowComparison,
      telemetry,
      latencyMs: nowMillis() - start,
    });

    const validation = validateIntegrationResult(result);
    if (!validation.valid) {
      if (isDev && typeof console?.warn === 'function') {
        console.warn(`[uni-engine] integration contract invalid: ${validation.errors.join(',')}`);
      }
      return buildFallbackResult({
        legacy: legacyAdapter,
        latencyMs: nowMillis() - start,
        reason: 'CONTRACT_INVALID',
        requested,
        evaluation,
        engineResult: engine,
      });
    }
    return result;
  } catch (error) {
    const code = error?.code ?? 'INTEGRATION_INTERNAL_ERROR';
    if (isDev && typeof console?.warn === 'function') {
      console.warn(`[uni-engine] integration error: ${code}`);
    }
    return buildFallbackResult({
      legacy,
      latencyMs: nowMillis() - start,
      reason: code === 'INTEGRATION_INTERNAL_ERROR' ? code : 'ADAPTER_ERROR',
    });
  }
}
