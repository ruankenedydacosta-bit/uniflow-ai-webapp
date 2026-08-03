// Uni Engine — Controlled Question (Parte 6, Bloco Único: perguntas seguras
// pelo pipeline legado).
//
// runControlledQuestionApplication — adapter seguro que consome as decisões
// OBSERVACIONAIS questionDecision / clarificationDecision (produzidas pela
// Application Layer a partir da Activation/Application) e, quando TODOS os
// gates passarem, seleciona UMA pergunta segura a partir de template FECHADO.
//
// A Uni Engine NUNCA escreve texto livre de pergunta: ela apenas indica se
// deve perguntar, prioridade, campo ausente/ambíguo, motivo, confiança e
// diagnóstico. O pipeline legado permanece soberano: escolher se exibe a
// pergunta, manter Pending Action, conduzir confirmação e retomar o fluxo.
// Esta camada NUNCA modifica Pending Action, NUNCA pula confirmação, NUNCA
// registra movimentação, NUNCA executa, escreve memória, aprende, chama
// banco/RPC, persiste ou dispara TTS.
//
// Uma única pergunta por turno, prioridade determinística:
// confirmação legada > Clarification > Question > resposta normal.
//
// Qualquer falha → fallback seguro (applied=false, sem pergunta) e o
// comportamento legado permanece integral.
import {
  isApplicationEnabledByPolicy,
  isEnvironmentAllowedByPolicy,
  isUserAuthorizedByPolicy,
  isConfidenceAllowedByPolicy,
  isRiskAllowedByPolicy,
  isControlledQuestionsEnabledByConfig,
  isControlledQuestionCapabilityEnabledByConfig,
} from './controlledQuestionPolicy.js';
import {
  validateQuestionDecision,
  validateClarificationDecision,
} from './applicationContracts.js';
import { selectControlledQuestionTemplateSafe } from './selectControlledQuestionTemplate.js';
import { buildControlledQuestion } from './buildControlledQuestion.js';
import { redactControlledQuestionTelemetry } from './telemetry/redactControlledQuestionTelemetry.js';
import { CONTROLLED_QUESTION_VERSION } from './controlledQuestionTypes.js';

// Intenções de REGISTRO do domínio legado: apenas elas podem receber pergunta
// de campo obrigatório ausente. Consultas/desconhecidos nunca perguntam.
export const PENDING_ACTION_REGISTER_INTENTS = Object.freeze([
  'register_expense',
  'register_income',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nowMillis() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

// Pending Action (legado) é apenas LIDO — nunca modificado. Compatibilidade:
// null (sem descritor) → o pipeline legado decide, não bloqueamos aqui.
// awaitingConfirmation → confirmação em curso tem precedência. Intenção que
// não é de registro → incompatível. missingFields fechado com o campo → a
// transição é válida; ausente da lista ou lista vazia → já respondido/irrelevante.
function isPendingActionFieldTransitionValid(pendingAction, field) {
  if (!isPlainObject(pendingAction)) return true;
  if (pendingAction.awaitingConfirmation === true) return false;
  const intent = typeof pendingAction.intent === 'string' ? pendingAction.intent : null;
  if (intent !== null && !PENDING_ACTION_REGISTER_INTENTS.includes(intent)) return false;
  if (Array.isArray(pendingAction.missingFields)) {
    if (pendingAction.missingFields.length === 0) return false;
    return pendingAction.missingFields.includes(field);
  }
  return true;
}

function buildFallback({
  config,
  legacyText,
  capability,
  decisionType,
  requestedField,
  sameTurn,
  confirmationPreserved,
  reason,
  latencyMs,
}) {
  return buildControlledQuestion({
    enabled: Boolean(config?.enabled),
    applied: false,
    capability,
    decisionType,
    requestedField,
    originalLegacyText: legacyText,
    fallbackUsed: true,
    fallbackReason: reason,
    sameTurn,
    pendingActionPreserved: true,
    confirmationPreserved,
    latencyMs,
  });
}

export function runControlledQuestionApplication({
  config = null,
  legacyText = null,
  applicationResult = null,
  pendingAction = null,
  alreadyAskedFields = null,
  confirmationRequired = false,
  context = {},
} = {}) {
  const start = nowMillis();
  const safeContext = isPlainObject(context) ? context : {};
  const safeConfig = isPlainObject(config) ? config : {};
  const legacy = typeof legacyText === 'string' ? legacyText : '';
  const alreadyAsked = Array.isArray(alreadyAskedFields)
    ? alreadyAskedFields.filter((item) => typeof item === 'string')
    : [];
  const confirmationActive = confirmationRequired === true
    || (isPlainObject(pendingAction) && pendingAction.awaitingConfirmation === true);

  const fallback = (reason, extra = {}) => buildFallback({
    config: safeConfig,
    legacyText: legacy,
    sameTurn: extra.sameTurn ?? false,
    capability: extra.capability ?? null,
    decisionType: extra.decisionType ?? null,
    requestedField: extra.requestedField ?? null,
    confirmationPreserved: confirmationActive || extra.confirmationPreserved !== false,
    reason,
    latencyMs: nowMillis() - start,
  });

  try {
    // 1. Turno: o resultado da Application pertence ao MESMO texto legado.
    //    Sem applicationResult ou com originalText diferente → STALE_TURN.
    if (!isPlainObject(applicationResult)) {
      return fallback('NO_DECISION', { sameTurn: false });
    }
    const sameTurn = applicationResult.originalText === legacy;
    if (!sameTurn) {
      return fallback('STALE_TURN', { sameTurn: false });
    }

    // 2. Ambiente development + usuário explicitamente autorizado.
    const environment = safeContext.environment
      ?? (safeContext.isDev ? 'development' : 'production');
    if (!isEnvironmentAllowedByPolicy(environment)) {
      return fallback('ENVIRONMENT_NOT_ALLOWED', { sameTurn });
    }
    const testUserIds = Array.isArray(safeConfig.activationTestUserIds)
      ? safeConfig.activationTestUserIds
      : [];
    const userId = safeContext.userId ?? null;
    if (!isUserAuthorizedByPolicy({ userId, testUserIds })) {
      return fallback('USER_NOT_AUTHORIZED', { sameTurn });
    }

    // 3. Engine + Integration + Activation + Application habilitadas.
    if (safeConfig.integrationEnabled !== true) {
      return fallback('INTEGRATION_DISABLED', { sameTurn });
    }
    if (safeConfig.activationEnabled !== true) {
      return fallback('ACTIVATION_DISABLED', { sameTurn });
    }
    if (!isApplicationEnabledByPolicy(safeConfig)) {
      return fallback('APPLICATION_DISABLED', { sameTurn });
    }

    // 4. Interruptor mestre da parte (VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED).
    if (!isControlledQuestionsEnabledByConfig(safeConfig)) {
      return fallback('CONTROLLED_QUESTIONS_DISABLED', { sameTurn });
    }

    // 5. Circuit breaker fechado e Execution Readiness permitindo.
    if (safeContext.circuitBreakerOpen === true) {
      return fallback('CIRCUIT_BREAKER_OPEN', { sameTurn });
    }
    if (safeContext.executionReady === false) {
      return fallback('EXECUTION_NOT_READY', { sameTurn });
    }

    // 6. Confiança mínima e risco permitido (decisão ou contexto).
    const questionConfidence = typeof safeContext.confidence === 'number'
      ? safeContext.confidence
      : (typeof applicationResult.questionDecision?.confidence === 'number'
        ? applicationResult.questionDecision.confidence
        : null);
    const clarificationConfidence = typeof safeContext.confidence === 'number'
      ? safeContext.confidence
      : (typeof applicationResult.clarificationDecision?.confidence === 'number'
        ? applicationResult.clarificationDecision.confidence
        : null);
    const confidence = questionConfidence ?? clarificationConfidence;
    if (confidence !== null && !isConfidenceAllowedByPolicy(confidence)) {
      return fallback('LOW_CONFIDENCE', { sameTurn });
    }
    const risk = safeContext.risk;
    if (typeof risk === 'string' && !isRiskAllowedByPolicy(risk)) {
      return fallback('RISK_NOT_ALLOWED', { sameTurn });
    }

    // 7. Confirmação obrigatória do legado tem PRECEDÊNCIA ABSOLUTA: nunca
    //    competimos com ela por uma mensagem.
    if (confirmationActive) {
      return fallback('CONFIRMATION_PRECEDES', { sameTurn });
    }

    // 8. Decisões observacionais da Application (mesmo turno).
    const questionDecision = applicationResult.questionDecision ?? null;
    const clarificationDecision = applicationResult.clarificationDecision ?? null;
    if (questionDecision === null && clarificationDecision === null) {
      return fallback('NO_DECISION', { sameTurn });
    }
    const questionValidation = questionDecision === null
      ? { valid: true }
      : validateQuestionDecision(questionDecision);
    const clarificationValidation = clarificationDecision === null
      ? { valid: true }
      : validateClarificationDecision(clarificationDecision);
    if (!questionValidation.valid || !clarificationValidation.valid) {
      return fallback('INVALID_DECISION', { sameTurn });
    }

    // 9. PRIORIDADE FECHADA: Clarification > Question (nunca duas perguntas).
    let capability = null;
    let decisionType = null;
    let requestedField = null;
    let shouldAsk = false;
    if (clarificationDecision !== null
      && clarificationDecision.shouldClarify === true
      && Array.isArray(clarificationDecision.ambiguousFields)
      && clarificationDecision.ambiguousFields.length > 0) {
      capability = 'CLARIFICATION_GUIDANCE';
      decisionType = 'clarification';
      requestedField = clarificationDecision.ambiguousFields[0];
      shouldAsk = true;
    } else if (questionDecision !== null
      && questionDecision.shouldAsk === true
      && Array.isArray(questionDecision.missingInformation)
      && questionDecision.missingInformation.length > 0) {
      capability = 'QUESTION_GUIDANCE';
      decisionType = 'question';
      requestedField = questionDecision.missingInformation[0];
      shouldAsk = true;
    }
    if (!shouldAsk || capability === null) {
      let reason = 'NO_DECISION';
      if (questionDecision !== null && questionDecision.shouldAsk === false) {
        reason = 'NO_ASK';
      } else if (clarificationDecision !== null && clarificationDecision.shouldClarify === false) {
        reason = 'NO_CLARIFY';
      }
      return fallback(reason, { sameTurn });
    }

    // 10. Flag da capability específica (config) — defesa em profundidade.
    if (!isControlledQuestionCapabilityEnabledByConfig(safeConfig, capability)) {
      return fallback('CAPABILITY_DISABLED', { sameTurn, capability, decisionType, requestedField });
    }

    // 11. Template fechado: campo na allowlist + texto estático existente +
    //     pergunta não duplicada neste turno.
    const selection = selectControlledQuestionTemplateSafe({
      field: requestedField,
      decisionType,
      alreadyAskedFields: alreadyAsked,
    });
    if (selection.blockReason !== null) {
      return fallback(selection.blockReason, {
        sameTurn,
        capability,
        decisionType,
        requestedField,
      });
    }

    // 12. Pending Action legado aceita a transição (apenas leitura).
    if (!isPendingActionFieldTransitionValid(pendingAction, requestedField)) {
      return fallback('PENDING_ACTION_INCOMPATIBLE', {
        sameTurn,
        capability,
        decisionType,
        requestedField,
      });
    }

    const latencyMs = nowMillis() - start;
    const result = buildControlledQuestion({
      enabled: Boolean(safeConfig.enabled),
      applied: true,
      capability,
      decisionType,
      requestedField,
      templateKey: selection.templateKey,
      finalQuestion: selection.finalQuestion,
      originalLegacyText: legacy,
      fallbackUsed: false,
      sameTurn: true,
      pendingActionPreserved: true,
      confirmationPreserved: !confirmationActive,
      latencyMs,
    });

    // Telemetria redigida (nunca texto, nunca legado, nunca conteúdo).
    if (safeConfig.applicationTelemetryEnabled
      && typeof safeContext.telemetryAdapter?.emit === 'function') {
      safeContext.telemetryAdapter.emit('controlledQuestion', redactControlledQuestionTelemetry(result));
    }

    return result;
  } catch (error) {
    if (safeContext.isDev && typeof console?.warn === 'function') {
      console.warn(`[uni-engine] controlled question error: ${error?.code ?? 'INTERNAL_ERROR'}`);
    }
    return fallback('INTERNAL_ERROR', { sameTurn: false });
  }
}

export function getControlledQuestionVersion() {
  return CONTROLLED_QUESTION_VERSION;
}
