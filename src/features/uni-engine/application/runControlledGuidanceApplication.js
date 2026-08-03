// Uni Engine — Application (Parte 5, Bloco 3: primeira ativação controlada).
//
// runControlledGuidanceApplication({ config, legacy, engineResult, guidance,
// context }):
//   1. valida a política de aplicação (flag applicationEnabled + motor +
//      Activation + Integration + ambiente + usuário + circuito fechado);
//   2. revalida as decisões da Activation (defesa em profundidade) restritas
//      às capacidades autorizadas nesta parte: RESPONSE_STYLE_GUIDANCE,
//      RESPONSE_LENGTH_GUIDANCE, QUESTION_GUIDANCE e CLARIFICATION_GUIDANCE;
//   3. REUTILIZA os apply* da Integration (applyResponseStyleGuidance e
//      applyResponseLengthGuidance) — sem duplicar cálculo;
//   4. QUESTION_GUIDANCE (Bloco 2) produz APENAS a decisão observacional
//      questionDecision (shouldAsk, questionPriority, missingInformation,
//      confidence, questionReason, diagnostics); CLARIFICATION_GUIDANCE
//      (Bloco 3) produz APENAS a decisão observacional clarificationDecision
//      (shouldClarify, clarificationPriority, ambiguousFields,
//      clarificationReason, confidence, diagnostics) — nunca texto de
//      pergunta/esclarecimento, nunca altera a resposta; a decisão fica
//      disponível para o pipeline legado decidir se exibe ou não;
//   5. monta o resultado serializável; qualquer erro ou gate falho → fallback
//      imediato ao texto legado (applied=false, finalText=originalText).
//
// Garantias:
//   - a Uni NUNCA gera automaticamente pergunta ou esclarecimento — apenas
//     decisões observacionais;
//   - execução financeira, escrita de memória, aprendizado e modificação de
//     Pending Actions NUNCA são propriedade desta camada;
//   - o resultado é serializável, sem funções, sem clientes externos;
//   - o texto legado continua a fonte final da resposta exibida ao usuário.
import {
  createApplicationResult,
  validateApplicationResult,
  createQuestionDecision,
  createClarificationDecision,
} from './applicationContracts.js';
import { APPLICATION_VERSION } from './applicationTypes.js';
import {
  APPLICATION_POLICY,
  shouldUseApplicationFallback,
  isUserAuthorizedByPolicy,
  isQuestionCapabilityEnabledByConfig,
  isQuestionConfidenceAllowedByPolicy,
  isClarificationCapabilityEnabledByConfig,
  isClarificationConfidenceAllowedByPolicy,
} from './applicationPolicy.js';
import { buildApplicationDiagnostics } from './buildApplicationDiagnostics.js';
import {
  buildIntegrationSuggested,
} from '../integration/runUniEngineIntegration.js';
import {
  evaluateEngineInfluence,
} from '../integration/evaluateEngineInfluence.js';
import {
  buildLegacyPipelineAdapter,
} from '../integration/legacyPipelineAdapter.js';
import {
  applyResponseStyleGuidance,
} from '../integration/applyResponseStyleGuidance.js';
import {
  applyResponseLengthGuidance,
} from '../integration/applyResponseLengthGuidance.js';
import { computeQuestionGuidance } from '../guidance/computeQuestionGuidance.js';
import { computeClarificationGuidance } from '../guidance/computeClarificationGuidance.js';
import { redactApplicationTelemetry } from './telemetry/redactApplicationTelemetry.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

// Mapeia o motivo da guidance da Integration para o enum fechado da decisão.
function mapQuestionReason(guidanceReason, missingCount) {
  if (missingCount > 0 && guidanceReason === 'GUIDED_FIELD_SWAP') return 'MISSING_FIELD_DETECTED';
  switch (guidanceReason) {
    case 'NO_SAFE_TARGET':
    case 'NO_MAPPING':
      return 'NO_SAFE_TARGET';
    case 'NOT_A_CLARIFICATION':
      return 'NOT_A_CLARIFICATION';
    case 'PROTECTED_RESPONSE':
      return 'PROTECTED_RESPONSE';
    case 'TEXT_OUTSIDE_ALLOWLIST':
      return 'TEXT_OUTSIDE_ALLOWLIST';
    case 'CAPABILITY_NOT_ACTIVE':
      return 'CAPABILITY_NOT_ACTIVE';
    default:
      return missingCount > 0 ? 'MISSING_FIELD_DETECTED' : 'NO_MISSING_FIELD';
  }
}

function buildQuestionDecision({ legacy, engineResult, confidence }) {
  const safeLegacy = legacy && typeof legacy === 'object' ? legacy : {};
  const suggested = buildIntegrationSuggested('QUESTION_GUIDANCE', engineResult);
  const outcome = computeQuestionGuidance({ legacy: safeLegacy, suggested });
  const guidance = outcome?.guidance ?? {};
  const missingInformation = Array.isArray(guidance.fieldsStillMissing)
    ? guidance.fieldsStillMissing
      .filter((field) => typeof field === 'string')
      .slice(0, APPLICATION_POLICY.maxMissingInformation)
    : [];
  const shouldAsk = guidance.applied === true && missingInformation.length > 0;
  const questionReason = mapQuestionReason(guidance.reason, missingInformation.length);
  const questionPriority = shouldAsk
    ? (missingInformation.length >= 2 ? 'HIGH' : 'MEDIUM')
    : 'LOW';
  const diagnostics = [
    'QUESTION_GUIDANCE',
    shouldAsk ? 'SHOULD_ASK' : 'NO_ASK',
    questionReason,
  ];
  return createQuestionDecision({
    shouldAsk,
    questionPriority,
    missingInformation,
    confidence,
    questionReason,
    diagnostics,
  });
}

// Mapeia o motivo da guidance da Integration para o enum fechado da decisão.
function mapClarificationReason(guidanceReason, ambiguityCount) {
  if (ambiguityCount > 0 && guidanceReason === 'SHORT_OBJECTIVE_QUESTION_SELECTED') return 'AMBIGUITY_DETECTED';
  switch (guidanceReason) {
    case 'NO_SAFE_TARGET':
    case 'NO_MAPPING':
      return 'NO_SAFE_TARGET';
    case 'NOT_A_CLARIFICATION':
      return 'NOT_A_CLARIFICATION';
    case 'PROTECTED_RESPONSE':
      return 'PROTECTED_RESPONSE';
    case 'TEXT_OUTSIDE_ALLOWLIST':
      return 'TEXT_OUTSIDE_ALLOWLIST';
    case 'CAPABILITY_NOT_ACTIVE':
      return 'CAPABILITY_NOT_ACTIVE';
    default:
      return ambiguityCount > 0 ? 'AMBIGUITY_DETECTED' : 'NO_AMBIGUITY';
  }
}

function buildClarificationDecision({ legacy, engineResult, confidence }) {
  const safeLegacy = legacy && typeof legacy === 'object' ? legacy : {};
  const suggested = buildIntegrationSuggested('CLARIFICATION_GUIDANCE', engineResult);
  const outcome = computeClarificationGuidance({ legacy: safeLegacy, suggested });
  const guidance = outcome?.guidance ?? {};
  const ambiguities = Array.isArray(engineResult?.classification?.ambiguities)
    ? engineResult.classification.ambiguities
    : [];
  const ambiguousFields = ambiguities
    .map((item) => (item && typeof item.type === 'string' ? item.type : null))
    .filter((field) => typeof field === 'string')
    .slice(0, APPLICATION_POLICY.maxAmbiguousFields);
  const shouldClarify = guidance.applied === true && ambiguousFields.length > 0;
  const clarificationReason = mapClarificationReason(guidance.reason, ambiguousFields.length);
  const clarificationPriority = shouldClarify
    ? (ambiguousFields.length >= 2 ? 'HIGH' : 'MEDIUM')
    : 'LOW';
  const diagnostics = [
    'CLARIFICATION_GUIDANCE',
    shouldClarify ? 'SHOULD_CLARIFY' : 'NO_CLARIFY',
    clarificationReason,
  ];
  return createClarificationDecision({
    shouldClarify,
    clarificationPriority,
    ambiguousFields,
    clarificationReason,
    confidence,
    diagnostics,
  });
}

function buildFallbackResult({ legacy, latencyMs, reason, context = {}, blockedBy = {} }) {
  const safeContext = safeObject(context);
  const originalText = typeof legacy?.text === 'string' ? legacy.text : null;
  const result = createApplicationResult({
    enabled: true,
    applied: false,
    originalText,
    finalText: originalText,
    fallbackUsed: true,
    fallbackReason: reason,
    status: 'fallback',
    blockedCapabilities: Object.keys(blockedBy),
    latencyMs,
  });
  const diagnostics = buildApplicationDiagnostics({
    enabled: true,
    activationEnabled: Boolean(safeContext.activationEnabled),
    integrationEnabled: Boolean(safeContext.integrationEnabled),
    environment: safeContext.environment,
    userAuthorized: Boolean(safeContext.userAuthorized),
    circuitBreakerOpen: safeContext.circuitBreakerOpen === true,
    confidence: typeof safeContext.confidence === 'number' ? safeContext.confidence : null,
    risk: typeof safeContext.risk === 'string' ? safeContext.risk : null,
    fallbackUsed: true,
    fallbackReason: reason,
    blockedCapabilities: blockedBy,
  });
  return { ...result, diagnostics };
}

export function runControlledGuidanceApplication({
  config = null,
  legacy = null,
  engineResult = null,
  guidance = null,
  context = null,
} = {}) {
  const start = nowMillis();
  const safeConfig = safeObject(config);
  const safeContext = safeObject(context);
  const isDev = Boolean(safeContext.isDev);
  const environment = typeof safeContext.environment === 'string' ? safeContext.environment : 'development';
  const userId = typeof safeContext.userId === 'string' ? safeContext.userId : null;
  const testUserIds = Array.isArray(safeConfig.activationTestUserIds)
    ? safeConfig.activationTestUserIds
    : [];
  const originalText = typeof legacy?.text === 'string' ? legacy.text : null;

  try {
    // 1. Política de aplicação: flag applicationEnabled + motor + Activation +
    //    Integration + ambiente + usuário + circuito fechado + texto + guidance.
    const gate = shouldUseApplicationFallback({
      config: safeConfig,
      environment,
      userId,
      testUserIds,
      circuitBreakerOpen: safeContext.circuitBreakerOpen === true,
      confidence: typeof safeContext.confidence === 'number' ? safeContext.confidence : null,
      risk: typeof safeContext.risk === 'string' ? safeContext.risk : null,
      capabilities: APPLICATION_POLICY.allowedCapabilities,
      text: originalText,
      guidance: guidance || engineResult,
    });
    if (gate.shouldFallback) {
      return buildFallbackResult({
        legacy,
        latencyMs: nowMillis() - start,
        reason: gate.reasonCode,
        context: safeContext,
      });
    }

    // 2. Adapter do pipeline legado (mesma normalização da Integration).
    const legacyAdapter = buildLegacyPipelineAdapter(legacy);
    if (!legacyAdapter) {
      return buildFallbackResult({
        legacy,
        latencyMs: nowMillis() - start,
        reason: 'INVALID_LEGACY_TEXT',
        context: safeContext,
      });
    }

    // 3. Decisões da Activation Engine (defesa em profundidade). Restritas às
    //    capacidades autorizadas nesta parte. A flag de capacidade do config
    //    também precisa estar ligada — variável ausente nunca aplica.
    const decisions = Array.isArray(engineResult?.activation?.decisions)
      ? engineResult.activation.decisions
      : Array.isArray(safeContext.activationDecisions)
        ? safeContext.activationDecisions
        : [];
    const evaluation = evaluateEngineInfluence({
      decisions,
      shadowMode: false,
      requestedCapabilities: APPLICATION_POLICY.allowedCapabilities,
      context: safeContext,
    });
    const capabilityFlags = safeConfig.activationCapabilities ?? {};
    const active = evaluation.active.filter((capability) =>
      APPLICATION_POLICY.allowedCapabilities.includes(capability)
      && capabilityFlags[capability] === true,
    );

    const blockedBy = {};
    for (const capability of APPLICATION_POLICY.allowedCapabilities) {
      if (!active.includes(capability)) {
        const entry = evaluation.byCapability[capability];
        blockedBy[capability] = capabilityFlags[capability] !== true
          ? 'CAPABILITY_DISABLED'
          : (entry?.blockedBy ?? 'CAPABILITY_NOT_ACTIVE');
      }
    }

    if (active.length === 0) {
      return buildFallbackResult({
        legacy: legacyAdapter,
        latencyMs: nowMillis() - start,
        reason: blockedBy.RESPONSE_STYLE_GUIDANCE === 'CAPABILITY_BLOCKED'
          || blockedBy.RESPONSE_LENGTH_GUIDANCE === 'CAPABILITY_BLOCKED'
          || blockedBy.QUESTION_GUIDANCE === 'CAPABILITY_BLOCKED'
          || blockedBy.CLARIFICATION_GUIDANCE === 'CAPABILITY_BLOCKED'
          ? 'CAPABILITY_BLOCKED'
          : 'CAPABILITY_NOT_ALLOWED',
        context: safeContext,
        blockedBy,
      });
    }

    // 4. Aplica SOMENTE as capacidades de texto autorizadas e ativas,
    //    reutilizando os apply* da Integration. QUESTION_GUIDANCE NUNCA
    //    altera texto — produz apenas a decisão observacional questionDecision.
    //    Em caso de erro em qualquer apply → fallback.
    let finalText = legacyAdapter.text;
    const appliedCapabilities = [];
    let styleApplied = false;
    let lengthApplied = false;
    let applyError = false;
    let questionDecision = null;
    let clarificationDecision = null;

    try {
      if (active.includes('RESPONSE_STYLE_GUIDANCE')) {
        const outcome = applyResponseStyleGuidance({
          legacy: legacyAdapter,
          suggested: buildIntegrationSuggested('RESPONSE_STYLE_GUIDANCE', engineResult),
          active: true,
        });
        if (outcome.guidance.applied && outcome.guidance.styleKey) {
          appliedCapabilities.push('RESPONSE_STYLE_GUIDANCE');
          styleApplied = true;
        }
      }

      if (active.includes('RESPONSE_LENGTH_GUIDANCE')) {
        const outcome = applyResponseLengthGuidance({
          legacy: legacyAdapter,
          suggested: buildIntegrationSuggested('RESPONSE_LENGTH_GUIDANCE', engineResult),
          active: true,
        });
        if (outcome.guidance.applied) {
          finalText = outcome.finalText;
          appliedCapabilities.push('RESPONSE_LENGTH_GUIDANCE');
          lengthApplied = true;
        }
      }

      // Decisão observacional de pergunta (Bloco 2). Nunca texto, nunca
      // altera a resposta. Produzida apenas quando a capacidade está ativa
      // e a confiança específica da pergunta é suficiente.
      if (active.includes('QUESTION_GUIDANCE')) {
        const questionConfidence = typeof safeContext.confidence === 'number'
          ? safeContext.confidence
          : (typeof engineResult?.decisionLayer?.confidence === 'number'
            ? engineResult.decisionLayer.confidence
            : null);
        if (!isQuestionCapabilityEnabledByConfig(safeConfig)) {
          blockedBy.QUESTION_GUIDANCE = 'CAPABILITY_DISABLED';
        } else if (
          questionConfidence !== null
          && !isQuestionConfidenceAllowedByPolicy(questionConfidence)
        ) {
          blockedBy.QUESTION_GUIDANCE = 'LOW_CONFIDENCE';
        } else {
          questionDecision = buildQuestionDecision({
            legacy: legacyAdapter,
            engineResult,
            confidence: questionConfidence,
          });
        }
      }

      // Decisão observacional de esclarecimento (Bloco 3). A Uni NUNCA gera
      // texto de esclarecimento — apenas sinaliza que o pipeline legado pode
      // precisar esclarecer. Produzida apenas quando a capacidade está ativa
      // e a confiança específica do esclarecimento é suficiente.
      if (active.includes('CLARIFICATION_GUIDANCE')) {
        const clarificationConfidence = typeof safeContext.confidence === 'number'
          ? safeContext.confidence
          : (typeof engineResult?.decisionLayer?.confidence === 'number'
            ? engineResult.decisionLayer.confidence
            : null);
        if (!isClarificationCapabilityEnabledByConfig(safeConfig)) {
          blockedBy.CLARIFICATION_GUIDANCE = 'CAPABILITY_DISABLED';
        } else if (
          clarificationConfidence !== null
          && !isClarificationConfidenceAllowedByPolicy(clarificationConfidence)
        ) {
          blockedBy.CLARIFICATION_GUIDANCE = 'LOW_CONFIDENCE';
        } else {
          clarificationDecision = buildClarificationDecision({
            legacy: legacyAdapter,
            engineResult,
            confidence: clarificationConfidence,
          });
        }
      }
    } catch (error) {
      applyError = true;
      if (isDev && typeof console?.warn === 'function') {
        console.warn(`[uni-engine] application apply error: ${error?.code ?? 'APPLY_ERROR'}`);
      }
    }

    if (applyError) {
      return buildFallbackResult({
        legacy: legacyAdapter,
        latencyMs: nowMillis() - start,
        reason: 'APPLY_ERROR',
        context: safeContext,
        blockedBy,
      });
    }

    const producedAny = appliedCapabilities.length > 0
      || questionDecision !== null
      || clarificationDecision !== null;
    const fallbackUsed = !producedAny;
    const fallbackReason = fallbackUsed ? 'INVALID_GUIDANCE' : null;
    const status = producedAny ? 'applied' : 'not_applied';

    const diagnostics = buildApplicationDiagnostics({
      enabled: true,
      activationEnabled: true,
      integrationEnabled: true,
      environment,
      userAuthorized: isUserAuthorizedByPolicy({ userId, testUserIds }),
      circuitBreakerOpen: safeContext.circuitBreakerOpen === true,
      confidence: typeof safeContext.confidence === 'number' ? safeContext.confidence : null,
      risk: typeof safeContext.risk === 'string' ? safeContext.risk : null,
      fallbackUsed,
      fallbackReason,
      appliedCapabilities,
      blockedCapabilities: blockedBy,
      questionDecision,
      clarificationDecision,
    });

    const shadowComparison = {
      originalTextLength: legacyAdapter.text.length,
      finalTextLength: finalText.length,
      lengthDelta: finalText.length - legacyAdapter.text.length,
      divergenceCount: appliedCapabilities.length,
    };

    const result = createApplicationResult({
      enabled: true,
      applied: producedAny,
      appliedCapabilities,
      blockedCapabilities: Object.keys(blockedBy),
      originalText: legacyAdapter.text,
      finalText,
      factualContentPreserved: true,
      styleApplied,
      lengthApplied,
      fallbackUsed,
      fallbackReason,
      status,
      diagnostics,
      shadowComparison,
      safety: {},
      questionDecision,
      clarificationDecision,
      latencyMs: nowMillis() - start,
    });

    const validation = validateApplicationResult(result);
    if (!validation.valid) {
      if (isDev && typeof console?.warn === 'function') {
        console.warn(`[uni-engine] application contract invalid: ${validation.errors.join(',')}`);
      }
      return buildFallbackResult({
        legacy: legacyAdapter,
        latencyMs: nowMillis() - start,
        reason: 'CONTRACT_ERROR',
        context: safeContext,
        blockedBy,
      });
    }

    // Telemetria redigida (nunca texto, IDs, valores ou memória).
    if (safeConfig.applicationTelemetryEnabled) {
      const telemetry = redactApplicationTelemetry({
        ...result,
        errorCode: null,
      });
      if (typeof safeContext.telemetryAdapter?.emit === 'function') {
        safeContext.telemetryAdapter.emit('application', telemetry);
      }
    }

    return result;
  } catch (error) {
    if (isDev && typeof console?.warn === 'function') {
      console.warn(`[uni-engine] application error: ${error?.code ?? 'APPLY_ERROR'}`);
    }
    return buildFallbackResult({
      legacy,
      latencyMs: nowMillis() - start,
      reason: 'APPLY_ERROR',
      context: safeContext,
    });
  }
}

export function getApplicationVersion() {
  return APPLICATION_VERSION;
}
