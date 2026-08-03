// Uni Engine — Conversation Routing (Parte 8, Bloco Único): seletor.
//
// selectControlledConversationRoute — ponto ÚNICO onde o pipeline legado
// consulta o Conversation Plan do MESMO turno para escolher, de forma
// controlada, qual caminho conversacional JÁ AUTORIZADO deve prevalecer.
//
// O seletor NÃO cria conteúdo: a rota escolhida aponta SEMPRE para uma
// alternativa JÁ produzida no mesmo turno (texto da Application, pergunta
// controlada de template fechado, confirmação legada, espera legada, silêncio
// legado). NUNCA executa, NUNCA escreve memória, NUNCA toca banco/RPC/TTS,
// NUNCA modifica Pending Action e NUNCA cria nem pula confirmação.
//
// Prioridade determinística fechada (nunca contornada pelo nextStep do
// Planner):
//   1. confirmação obrigatória do legado;
//   2. erro/instrução de segurança obrigatória do legado;
//   3. clarificação crítica válida;
//   4. pergunta obrigatória válida;
//   5. resposta autorizada;
//   6. espera válida;
//   7. nenhuma saída válida;
//   8. fallback legado.
//
// Gates (qualquer falha → rota legada integral, sem modificar nada):
//   ambiente development, usuário autorizado, Integration/Activation/
//   Application habilitadas, flag de roteamento ligada, Planner válido,
//   plannerStatus PLANNED, mesmo turno comprovado, confiança mínima, risco
//   permitido, circuit breaker fechado, Capability Readiness compatível,
//   Execution Readiness compatível, rota permitida pela policy e resultado
//   downstream correspondente válido.
import {
  isConversationRoutingEnabledByConfig,
  isEnvironmentAllowedByRoutingPolicy,
  isConfidenceAllowedByRoutingPolicy,
  isRiskAllowedByRoutingPolicy,
  isPlannerOrientedRoute,
  isRouteConfidenceGated,
  getRouteCapability,
  routeForNextStep,
} from './conversationRoutingPolicy.js';
import {
  createEmptyConversationRoutingResult,
  createConversationRoutingResult,
  validateConversationRoutingResult,
  deepFreeze,
} from './conversationRoutingContracts.js';
import { buildConversationRoutingDiagnostics } from './buildConversationRoutingDiagnostics.js';
import { isCapabilityAllowedByPolicy, isApplicationEnabledByPolicy } from '../application/applicationPolicy.js';
import { isSafetyIntegral } from '../application/selectControlledVisibleResponse.js';
import {
  isControlledQuestionSafetyIntegral,
} from '../application/controlledQuestionContracts.js';
import {
  CONTROLLED_QUESTION_TEMPLATE_KEYS,
} from '../application/controlledQuestionTypes.js';
import {
  isPlannerStatus,
  isNextStep,
} from '../conversation-planner/conversationPlannerTypes.js';

const VISIBLE_ANSWER_CAPABILITIES = Object.freeze([
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] conversation-routing ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Gates de segurança (qualquer falha → rota legada integral).
// ---------------------------------------------------------------------------

function evaluateGates(input) {
  const { config, environment, authorized, conversationPlan, sameTurn } = input;
  // Interruptor MESTRE da parte primeiro: sem a flag explícita, nada mais é
  // avaliado — rota legada integral.
  if (config.conversationRoutingEnabled !== true) {
    return { ok: false, fallbackReason: 'ROUTING_DISABLED' };
  }
  // Dependências obrigatórias (mesma cascata da Parte 6).
  if (config.activationEnabled !== true) return { ok: false, fallbackReason: 'ACTIVATION_DISABLED' };
  if (config.integrationEnabled !== true) return { ok: false, fallbackReason: 'INTEGRATION_DISABLED' };
  if (!isApplicationEnabledByPolicy(config)) {
    return { ok: false, fallbackReason: 'APPLICATION_DISABLED' };
  }
  if (!isEnvironmentAllowedByRoutingPolicy(environment)) {
    return { ok: false, fallbackReason: 'ENVIRONMENT_NOT_ALLOWED' };
  }
  if (authorized !== true) return { ok: false, fallbackReason: 'USER_NOT_AUTHORIZED' };
  if (!isPlainObject(conversationPlan)) {
    return { ok: false, fallbackReason: 'PLANNER_INVALID' };
  }
  if (conversationPlan.plannerStatus !== 'PLANNED') {
    return {
      ok: false,
      fallbackReason: isPlannerStatus(conversationPlan.plannerStatus)
        ? 'PLANNER_STATUS_INVALID'
        : 'PLANNER_INVALID',
    };
  }
  if (sameTurn !== true) return { ok: false, fallbackReason: 'SAME_TURN_VIOLATED' };
  return { ok: true, fallbackReason: null };
}

// ---------------------------------------------------------------------------
// Obrigações do legado (prioridades 1 e 2 — NUNCA contornadas pelo Planner).
// ---------------------------------------------------------------------------

function isLegacyConfirmationPresent(legacyConfirmation) {
  return isPlainObject(legacyConfirmation)
    && (legacyConfirmation.pending === true
      || typeof legacyConfirmation.confirmationError === 'string');
}

function isMandatoryLegacyBlocking(legacyResponse, legacyConfirmation) {
  const legacy = isPlainObject(legacyResponse) ? legacyResponse : {};
  if (legacy.mandatoryBlocking === true) return true;
  if (legacy.securityInstruction === true) return true;
  if (legacy.responseType === 'error') return true;
  if (isPlainObject(legacyConfirmation) && typeof legacyConfirmation.confirmationError === 'string') {
    return true;
  }
  return false;
}

function isLegacyWaiting(legacyResponse) {
  const legacy = isPlainObject(legacyResponse) ? legacyResponse : {};
  if (legacy.isWaiting === true) return true;
  if (legacy.responseType === 'wait') return true;
  const status = legacy.status ?? null;
  return typeof status === 'string' && ['waiting', 'processing', 'executing'].includes(status);
}

function isLegacySilent(legacyResponse, legacyConfirmation) {
  const legacy = isPlainObject(legacyResponse) ? legacyResponse : {};
  const text = typeof legacy.text === 'string' ? legacy.text : null;
  if (text && text.trim() !== '') return false;
  if (isLegacyConfirmationPresent(legacyConfirmation)) return false;
  if (isMandatoryLegacyBlocking(legacyResponse, legacyConfirmation)) return false;
  const responseType = legacy.responseType ?? null;
  return responseType === null
    || responseType === 'none'
    || responseType === 'silent'
    || responseType === 'noop';
}

// ---------------------------------------------------------------------------
// Validação do resultado downstream correspondente a cada rota.
// ---------------------------------------------------------------------------

// ROTA ANSWER: usa EXCLUSIVAMENTE a resposta permitida pela Application Layer
// (Style/Length aplicadas, conteúdo factual preservado, safety íntegro,
// mesmo texto legado de origem e flags de capacidade ligadas). Nenhuma
// informação factual nova é criada.
function isAnswerDownstreamValid(applicationResult, legacyResponse, config) {
  if (!isPlainObject(applicationResult)) return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  if (applicationResult.applied !== true) return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  if (applicationResult.fallbackUsed === true) return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  if (applicationResult.factualContentPreserved !== true) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (typeof applicationResult.finalText !== 'string' || applicationResult.finalText.trim() === '') {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  const appliedCapabilities = Array.isArray(applicationResult.appliedCapabilities)
    ? applicationResult.appliedCapabilities
    : [];
  if (appliedCapabilities.length === 0) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (appliedCapabilities.some((cap) => !VISIBLE_ANSWER_CAPABILITIES.includes(cap))) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (appliedCapabilities.some((cap) => !isCapabilityAllowedByPolicy(cap))) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  // MESMO TURNO: o resultado pertence ao texto legado ATUAL.
  const legacy = isPlainObject(legacyResponse) ? legacyResponse : {};
  if (typeof legacy.text === 'string' && applicationResult.originalText !== legacy.text) {
    return { valid: false, reason: 'SAME_TURN_VIOLATED' };
  }
  if (!isSafetyIntegral(applicationResult.safety)) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  const capabilities = isPlainObject(config.activationCapabilities)
    ? config.activationCapabilities
    : {};
  if (appliedCapabilities.some((cap) => capabilities[cap] !== true)) {
    return { valid: false, reason: 'CAPABILITY_INCOMPATIBLE' };
  }
  return { valid: true, reason: null };
}

// ROTA QUESTION/CLARIFICATION: usa EXCLUSIVAMENTE o resultado de pergunta
// controlada válido — template na allowlist, safety íntegro, mesmo turno,
// Pending Action e confirmação preservados. Nenhuma pergunta livre; uma
// única pergunta por turno.
function isQuestionRouteDownstreamValid(controlledQuestionResult, decisionType, applicationResult, config) {
  if (!isPlainObject(controlledQuestionResult)) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (controlledQuestionResult.applied !== true) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (controlledQuestionResult.fallbackUsed === true) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (controlledQuestionResult.decisionType !== decisionType) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (!CONTROLLED_QUESTION_TEMPLATE_KEYS.includes(controlledQuestionResult.templateKey)) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (typeof controlledQuestionResult.finalQuestion !== 'string'
    || controlledQuestionResult.finalQuestion.trim() === '') {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (controlledQuestionResult.sameTurn !== true) {
    return { valid: false, reason: 'SAME_TURN_VIOLATED' };
  }
  if (controlledQuestionResult.pendingActionPreserved !== true) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (controlledQuestionResult.confirmationPreserved !== true) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  if (!isControlledQuestionSafetyIntegral(controlledQuestionResult.safety)) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  const expectedCapability = decisionType === 'question' ? 'QUESTION_GUIDANCE' : 'CLARIFICATION_GUIDANCE';
  if (controlledQuestionResult.capability !== expectedCapability) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  // A decisão observacional do MESMO turno precisa sustentar a pergunta.
  if (decisionType === 'question') {
    if (applicationResult?.questionDecision?.shouldAsk !== true) {
      return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
    }
  } else if (applicationResult?.clarificationDecision?.shouldClarify !== true) {
    return { valid: false, reason: 'DOWNSTREAM_RESULT_INVALID' };
  }
  const capabilities = isPlainObject(config.activationCapabilities)
    ? config.activationCapabilities
    : {};
  if (capabilities[expectedCapability] !== true) {
    return { valid: false, reason: 'CAPABILITY_INCOMPATIBLE' };
  }
  return { valid: true, reason: null };
}

// ---------------------------------------------------------------------------
// Compatibilidade com os snapshots observacionais do mesmo turno (quando
// fornecidos): Capability Readiness e Execution Readiness.
// ---------------------------------------------------------------------------

function isCapabilityReadinessCompatible(route, capabilityReadinessSnapshot, capability) {
  if (!isPlainObject(capabilityReadinessSnapshot)) return true;
  const blocked = Array.isArray(capabilityReadinessSnapshot.blockedCapabilities)
    ? capabilityReadinessSnapshot.blockedCapabilities
    : [];
  if (capability) {
    return !blocked.includes(capability);
  }
  const eligible = Array.isArray(capabilityReadinessSnapshot.eligibleCapabilities)
    ? capabilityReadinessSnapshot.eligibleCapabilities
    : [];
  return eligible.some((item) => VISIBLE_ANSWER_CAPABILITIES.includes(item));
}

function isExecutionReadinessCompatible(route, executionReadinessSnapshot) {
  if (!isPlainObject(executionReadinessSnapshot)) return true;
  if (route === 'ROUTE_WAIT' || route === 'ROUTE_NONE') return true;
  const reasons = Array.isArray(executionReadinessSnapshot.executionBlockedReasons)
    ? executionReadinessSnapshot.executionBlockedReasons
    : [];
  if (reasons.includes('CIRCUIT_BREAKER_OPEN')) return false;
  if (executionReadinessSnapshot.executionAvailable === false && reasons.length > 0) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Seletor principal.
// ---------------------------------------------------------------------------

export function selectControlledConversationRoute(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const isDev = Boolean(safe.isDev);
  const startedAt = typeof performance?.now === 'function' ? performance.now() : Date.now();
  const {
    conversationPlan = null,
    applicationResult = null,
    controlledQuestionResult = null,
    legacyResponse = null,
    legacyConfirmation = null,
    pendingActionState = null,
    config = null,
    sameTurn = false,
    capabilityReadinessSnapshot = null,
    executionReadinessSnapshot = null,
  } = safe;

  const routeResult = (input) => createConversationRoutingResult({
    enabled: true,
    applied: input.applied,
    selectedRoute: input.selectedRoute,
    requestedNextStep: input.requestedNextStep,
    routeSource: input.routeSource,
    fallbackReason: input.fallbackReason ?? null,
    confirmationPreserved: input.confirmationPreserved === true,
    pendingActionPreserved: input.pendingActionPreserved === true,
    diagnostics: input.diagnostics,
  });

  const finish = (result, fallbackReason = null) => {
    const latencyMs = typeof performance?.now === 'function'
      ? Number((performance.now() - startedAt).toFixed(2))
      : Number(Date.now().toFixed(2));
    const enriched = deepFreeze({
      ...result,
      latencyMs,
      enabled: isConversationRoutingEnabledByConfig(config),
      sameTurn: Boolean(sameTurn),
      confirmationPreserved: Boolean(
        isLegacyConfirmationPresent(legacyConfirmation)
        || result.selectedRoute === 'ROUTE_CONFIRMATION',
      ),
      pendingActionPreserved: Boolean(
        isPlainObject(pendingActionState)
        || result.selectedRoute === 'ROUTE_WAIT'
        || result.selectedRoute === 'ROUTE_LEGACY_SECURITY_ERROR',
      ),
      fallbackReason,
    });
    const validated = validateConversationRoutingResult(enriched);
    if (!validated.valid) {
      warn(isDev, `contract invalid: ${validated.errors.join(',')}`);
      return createEmptyConversationRoutingResult({
        enabled: isConversationRoutingEnabledByConfig(config),
        sameTurn: Boolean(sameTurn),
        fallbackReason: 'ERROR_SAFE',
        confirmationPreserved: isLegacyConfirmationPresent(legacyConfirmation),
        pendingActionPreserved: isPlainObject(pendingActionState),
      });
    }
    return enriched;
  };

  const fallbackResult = (fallbackReason, requestedNextStep = null) => routeResult({
    applied: false,
    selectedRoute: 'ROUTE_LEGACY_FALLBACK',
    requestedNextStep,
    routeSource: 'policy',
    fallbackReason,
    pendingActionPreserved: isPlainObject(pendingActionState),
    diagnostics: buildConversationRoutingDiagnostics({
      fallbackUsed: true,
      fallbackReason,
      pendingActionPreserved: isPlainObject(pendingActionState),
    }),
  });

  const plannerResult = (selectedRoute, requestedNextStep) => routeResult({
    applied: true,
    selectedRoute,
    requestedNextStep,
    routeSource: 'planner',
    fallbackReason: null,
    confirmationPreserved: selectedRoute === 'ROUTE_CONFIRMATION',
    pendingActionPreserved: isPlainObject(pendingActionState) || selectedRoute === 'ROUTE_WAIT',
    diagnostics: buildConversationRoutingDiagnostics({
      selectedRoute,
      routeSource: 'planner',
      confirmationPreserved: selectedRoute === 'ROUTE_CONFIRMATION',
      pendingActionPreserved: isPlainObject(pendingActionState) || selectedRoute === 'ROUTE_WAIT',
    }),
  });

  try {
    const gates = evaluateGates(safe);
    if (!gates.ok) {
      const base = createConversationRoutingResult({
        enabled: isConversationRoutingEnabledByConfig(config),
        applied: false,
        selectedRoute: 'ROUTE_LEGACY_FALLBACK',
        routeSource: 'fallback',
        fallbackReason: gates.fallbackReason,
        confirmationPreserved: isLegacyConfirmationPresent(legacyConfirmation),
        pendingActionPreserved: isPlainObject(pendingActionState),
        diagnostics: buildConversationRoutingDiagnostics({
          fallbackUsed: true,
          fallbackReason: gates.fallbackReason,
          confirmationPreserved: isLegacyConfirmationPresent(legacyConfirmation),
          pendingActionPreserved: isPlainObject(pendingActionState),
        }),
      });
      return finish(base, gates.fallbackReason);
    }

    const legacy = isPlainObject(legacyResponse) ? legacyResponse : {};
    const plan = conversationPlan;

    // 1. Confirmação obrigatória do legado (precedência máxima — o nextStep
    //    do Planner NUNCA a contorna).
    if (isLegacyConfirmationPresent(legacyConfirmation)) {
      const base = routeResult({
        applied: true,
        selectedRoute: 'ROUTE_CONFIRMATION',
        requestedNextStep: plan.nextStep,
        routeSource: 'legacy-priority',
        fallbackReason: null,
        confirmationPreserved: true,
        pendingActionPreserved: isPlainObject(pendingActionState),
        diagnostics: buildConversationRoutingDiagnostics({
          selectedRoute: 'ROUTE_CONFIRMATION',
          routeSource: 'legacy-priority',
          confirmationPreserved: true,
          pendingActionPreserved: isPlainObject(pendingActionState),
        }),
      });
      return finish(base, null);
    }

    // 2. Erro/instrução de segurança obrigatória do legado (vence o Planner).
    if (isMandatoryLegacyBlocking(legacyResponse, legacyConfirmation)) {
      const base = routeResult({
        applied: true,
        selectedRoute: 'ROUTE_LEGACY_SECURITY_ERROR',
        requestedNextStep: plan.nextStep,
        routeSource: 'legacy-priority',
        fallbackReason: null,
        pendingActionPreserved: isPlainObject(pendingActionState),
        diagnostics: buildConversationRoutingDiagnostics({
          selectedRoute: 'ROUTE_LEGACY_SECURITY_ERROR',
          routeSource: 'legacy-priority',
          pendingActionPreserved: isPlainObject(pendingActionState),
        }),
      });
      return finish(base, null);
    }

    // 3. Rota solicitada pelo Planner (prioridades 3–7), com resultado
    //    downstream correspondente VÁLIDO. Uma única rota por turno.
    const requestedRoute = routeForNextStep(plan.nextStep);
    if (!requestedRoute || !isPlannerOrientedRoute(requestedRoute)) {
      return finish(
        fallbackResult('ROUTE_UNKNOWN', isNextStep(plan.nextStep) ? plan.nextStep : null),
        'ROUTE_UNKNOWN',
      );
    }

    const capability = getRouteCapability(requestedRoute);

    // Gates específicos da rota solicitada (confiança, risco, circuit
    // breaker, Capability Readiness e Execution Readiness).
    if (isRouteConfidenceGated(requestedRoute)
      && !isConfidenceAllowedByRoutingPolicy(plan.confidence)) {
      return finish(fallbackResult('LOW_CONFIDENCE', plan.nextStep), 'LOW_CONFIDENCE');
    }
    if (typeof legacy.risk === 'string' && !isRiskAllowedByRoutingPolicy(legacy.risk)) {
      return finish(fallbackResult('HIGH_RISK', plan.nextStep), 'HIGH_RISK');
    }
    if (legacy.circuitBreakerOpen === true) {
      return finish(fallbackResult('CIRCUIT_BREAKER_OPEN', plan.nextStep), 'CIRCUIT_BREAKER_OPEN');
    }
    if (!isCapabilityReadinessCompatible(requestedRoute, capabilityReadinessSnapshot, capability)) {
      return finish(fallbackResult('CAPABILITY_INCOMPATIBLE', plan.nextStep), 'CAPABILITY_INCOMPATIBLE');
    }
    if (!isExecutionReadinessCompatible(requestedRoute, executionReadinessSnapshot)) {
      return finish(
        fallbackResult('EXECUTION_READINESS_INCOMPATIBLE', plan.nextStep),
        'EXECUTION_READINESS_INCOMPATIBLE',
      );
    }

    // Rota WAIT: somente quando o fluxo legado JÁ está aguardando (não cria
    // silêncio indevido nem loading permanente).
    if (requestedRoute === 'ROUTE_WAIT') {
      if (isLegacyWaiting(legacyResponse)) {
        return finish(plannerResult('ROUTE_WAIT', plan.nextStep), null);
      }
      return finish(fallbackResult('NO_VALID_ROUTE', plan.nextStep), 'NO_VALID_ROUTE');
    }

    // Rota NONE: somente quando o legado já decidiu não enviar mensagem —
    // nunca oculta erro, confirmação ou próximo passo obrigatório.
    if (requestedRoute === 'ROUTE_NONE') {
      if (isLegacySilent(legacyResponse, legacyConfirmation)) {
        return finish(plannerResult('ROUTE_NONE', plan.nextStep), null);
      }
      return finish(fallbackResult('NO_VALID_ROUTE', plan.nextStep), 'NO_VALID_ROUTE');
    }

    // Rota CONFIRMATION solicitada pelo Planner: só existe se a confirmação
    // legada já estiver presente (a Engine nunca cria confirmação).
    if (requestedRoute === 'ROUTE_CONFIRMATION') {
      if (isLegacyConfirmationPresent(legacyConfirmation)) {
        return finish(plannerResult('ROUTE_CONFIRMATION', plan.nextStep), null);
      }
      return finish(fallbackResult('NO_VALID_ROUTE', plan.nextStep), 'NO_VALID_ROUTE');
    }

    // Rota ANSWER: resposta permitida pela Application Layer, com resultado
    // downstream correspondente válido (fallback para o texto legado).
    if (requestedRoute === 'ROUTE_ANSWER') {
      const downstream = isAnswerDownstreamValid(applicationResult, legacyResponse, config);
      if (downstream.valid) {
        return finish(plannerResult('ROUTE_ANSWER', plan.nextStep), null);
      }
      return finish(fallbackResult(downstream.reason, plan.nextStep), downstream.reason);
    }

    // Rota QUESTION/CLARIFICATION: pergunta controlada de template fechado.
    const expectedDecisionType = requestedRoute === 'ROUTE_QUESTION' ? 'question' : 'clarification';
    const downstream = isQuestionRouteDownstreamValid(
      controlledQuestionResult,
      expectedDecisionType,
      applicationResult,
      config,
    );
    if (downstream.valid) {
      return finish(plannerResult(requestedRoute, plan.nextStep), null);
    }
    return finish(fallbackResult(downstream.reason, plan.nextStep), downstream.reason);
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'CONVERSATION_ROUTING_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    return createEmptyConversationRoutingResult({
      enabled: isConversationRoutingEnabledByConfig(config),
      sameTurn: Boolean(sameTurn),
      fallbackReason: 'ERROR_SAFE',
      confirmationPreserved: isLegacyConfirmationPresent(legacyConfirmation),
      pendingActionPreserved: isPlainObject(pendingActionState),
    });
  }
}
