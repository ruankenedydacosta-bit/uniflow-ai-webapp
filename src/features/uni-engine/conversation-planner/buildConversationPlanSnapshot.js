// Uni Engine — Conversation Planner (Parte 7, Bloco Único).
//
// buildConversationPlanSnapshot({ observationSnapshot, guidanceSnapshot,
// decisionSnapshot, decisionReadinessSnapshot, capabilityReadinessSnapshot,
// executionReadinessSnapshot, applicationResult, context }):
//   1. consome SOMENTE snapshots JÁ existentes (Observation, Guidance,
//      Decision, Capability Readiness, Execution Readiness e Application);
//   2. normaliza os sinais observacionais (confirmação, clarificação,
//      pergunta, espera, resposta) a partir desses snapshots;
//   3. resolve o PRÓXIMO PASSO lógico com prioridade determinística fechada:
//      confirmação > clarificação > pergunta > espera > resposta > nenhum;
//   4. produz o ConversationPlan serializável e congelado (mode
//      observational, legacyPreserved true, applied false);
//   5. qualquer erro → snapshot vazio seguro (falha segura).
//
// Garantias: NUNCA gera texto, NUNCA responde, NUNCA executa, NUNCA altera
// resposta, Pending Action, memória, banco, RPC ou TTS. O plano é apenas uma
// decisão observacional para a FUTURA camada de ativação.
import {
  CONVERSATION_PLANNER_POLICY,
  clamp01,
} from './conversationPlannerPolicy.js';
import {
  createEmptyConversationPlanSnapshot,
  createConversationPlanSnapshot,
  validateConversationPlanSnapshot,
} from './conversationPlannerContracts.js';
import { buildConversationPlannerDiagnostics } from './buildConversationPlannerDiagnostics.js';

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] conversation-planner ${message}`);
  }
}

// Normaliza o tipo de decisão da Decision Layer (enum maiúsculo do contrato;
// também aceita a forma minúscula dos fixtures) para comparação segura.
function normalizeDecisionType(value) {
  if (typeof value !== 'string') return null;
  return value.toUpperCase();
}

function hasNonEmptyStrings(value) {
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item !== '');
}

// Sinais observacionais derivados APENAS dos snapshots já produzidos.
// Nunca re-executa nenhuma camada; qualquer dado ausente → sinal false.
function collectSignals({
  observationSnapshot,
  guidanceSnapshot,
  decisionSnapshot,
  decisionReadinessSnapshot,
  capabilityReadinessSnapshot,
  executionReadinessSnapshot,
  applicationResult,
}) {
  const observation = safeObject(observationSnapshot);
  const guidance = safeObject(
    guidanceSnapshot
    ?? observation.guidanceSnapshot,
  );
  const decision = safeObject(decisionSnapshot);
  const decisionReadiness = safeObject(decisionReadinessSnapshot);
  const capabilityReadiness = safeObject(capabilityReadinessSnapshot);
  const executionReadiness = safeObject(executionReadinessSnapshot);
  const application = safeObject(applicationResult);

  const decisionType = normalizeDecisionType(decision.decisionType);
  const nextDecisionType = normalizeDecisionType(decision.nextDecisionType);

  const questionDecision = safeObject(application.questionDecision);
  const clarificationDecision = safeObject(application.clarificationDecision);

  const executionBlockedReasons = Array.isArray(executionReadiness.executionBlockedReasons)
    ? executionReadiness.executionBlockedReasons
    : [];

  const guidanceCapabilities = Array.isArray(guidance.capabilitiesComputed)
    ? guidance.capabilitiesComputed
    : [];

  const signals = {
    confirmation: decisionType === 'CONFIRM' || nextDecisionType === 'CONFIRM',
    clarification: clarificationDecision.shouldClarify === true
      && hasNonEmptyStrings(clarificationDecision.ambiguousFields),
    clarificationByGuidance: guidance.clarificationGuidance?.applied === true,
    question: questionDecision.shouldAsk === true
      && hasNonEmptyStrings(questionDecision.missingInformation),
    questionByGuidance: guidance.questionGuidance?.applied === true,
    askByDecision: decisionType === 'ASK' || nextDecisionType === 'ASK',
    wait: decisionType === 'WAIT'
      || executionBlockedReasons.includes('CIRCUIT_BREAKER_OPEN')
      || (executionReadiness.executionAvailable === false && executionBlockedReasons.length > 0),
    answer: decisionType === 'ANSWER'
      || observation.integrationSnapshot?.applied === true
      || guidanceCapabilities.length > 0,
  };

  return {
    signals,
    observation,
    guidance,
    decision,
    application,
    decisionReadiness,
    capabilityReadiness,
    executionReadiness,
    executionBlockedReasons,
    decisionType,
    guidanceCapabilities,
  };
}

// Prioridade determinística fechada: quanto menor o número, maior a
// prioridade. A mesma ordem da política nunca muda entre execuções.
function resolveNextStep(signals) {
  if (signals.confirmation) return 'NEXT_STEP_CONFIRMATION';
  if (signals.clarification || signals.clarificationByGuidance) return 'NEXT_STEP_CLARIFICATION';
  if (signals.question || signals.questionByGuidance || signals.askByDecision) return 'NEXT_STEP_QUESTION';
  if (signals.wait) return 'NEXT_STEP_WAIT';
  if (signals.answer) return 'NEXT_STEP_ANSWER';
  return 'NEXT_STEP_NONE';
}

function reasonForStep(nextStep, executionBlockedReasons) {
  switch (nextStep) {
    case 'NEXT_STEP_CONFIRMATION':
      return 'CONFIRMATION_PENDING';
    case 'NEXT_STEP_CLARIFICATION':
      return 'CLARIFICATION_REQUIRED';
    case 'NEXT_STEP_QUESTION':
      return 'MISSING_INFORMATION';
    case 'NEXT_STEP_WAIT':
      if (executionBlockedReasons.includes('CIRCUIT_BREAKER_OPEN')) return 'CIRCUIT_BREAKER_OPEN';
      if (executionBlockedReasons.length > 0) return 'EXECUTION_BLOCKED';
      return 'DECISION_WAIT';
    case 'NEXT_STEP_ANSWER':
      return 'DECISION_RESPOND';
    default:
      return 'NO_SIGNAL';
  }
}

// Confiança do plano: prioriza a confiança específica da decisão consumida;
// na ausência, usa a confiança da Decision Layer; senão, o padrão fechado.
function confidenceForStep(nextStep, { application, decision }) {
  if (nextStep === 'NEXT_STEP_QUESTION' && typeof application.questionDecision?.confidence === 'number') {
    return clamp01(application.questionDecision.confidence);
  }
  if (nextStep === 'NEXT_STEP_CLARIFICATION' && typeof application.clarificationDecision?.confidence === 'number') {
    return clamp01(application.clarificationDecision.confidence);
  }
  if (typeof decision.confidence === 'number') {
    return clamp01(decision.confidence);
  }
  if (nextStep === 'NEXT_STEP_NONE') {
    return CONVERSATION_PLANNER_POLICY.defaultNoneConfidence;
  }
  return CONVERSATION_PLANNER_POLICY.defaultConfidence;
}

function collectSources({
  observationSnapshot,
  guidanceSnapshot,
  decisionSnapshot,
  decisionReadinessSnapshot,
  capabilityReadinessSnapshot,
  executionReadinessSnapshot,
  applicationResult,
}) {
  const sources = [];
  if (observationSnapshot && typeof observationSnapshot === 'object') sources.push('observation');
  if (guidanceSnapshot && typeof guidanceSnapshot === 'object') sources.push('guidance');
  if (decisionSnapshot && typeof decisionSnapshot === 'object') sources.push('decision');
  if (decisionReadinessSnapshot && typeof decisionReadinessSnapshot === 'object') {
    sources.push('decision-readiness');
  }
  if (capabilityReadinessSnapshot && typeof capabilityReadinessSnapshot === 'object') {
    sources.push('capability-readiness');
  }
  if (executionReadinessSnapshot && typeof executionReadinessSnapshot === 'object') {
    sources.push('execution-readiness');
  }
  if (applicationResult && typeof applicationResult === 'object') sources.push('application');
  return sources;
}

export function buildConversationPlanSnapshot(options = {}) {
  const safe = safeObject(options);
  const safeContext = safeObject(safe.context);
  const isDev = Boolean(safeContext.isDev);

  try {
    const context = collectSignals(safe);
    const { signals, observation, executionBlockedReasons } = context;

    const nextStep = resolveNextStep(signals);
    const observationAvailable = observation.serializable === true
      || Object.keys(observation).length > 0;

    const shadowMode = Boolean(
      safeContext.shadowMode
      ?? observation.shadowMode
      ?? true,
    );

    const reason = reasonForStep(nextStep, executionBlockedReasons);
    const confidence = confidenceForStep(nextStep, context);

    const diagnostics = buildConversationPlannerDiagnostics({
      nextStep,
      observationAvailable,
      shadowMode,
      legacyPreserved: true,
      applied: false,
    });

    const metadata = {
      sources: collectSources(safe),
      confidence,
      environment: typeof safeContext.environment === 'string' ? safeContext.environment : null,
      signalSource: nextStep.toLowerCase().replace('next_step_', ''),
      decisionType: context.decisionType,
      executionBlockedCount: executionBlockedReasons.length,
    };

    const snapshot = createConversationPlanSnapshot({
      enabled: true,
      shadowMode,
      plannerStatus: 'PLANNED',
      nextStep,
      confidence,
      reason,
      diagnostics,
      metadata,
    });

    const validation = validateConversationPlanSnapshot(snapshot);
    if (!validation.valid) {
      warn(isDev, `contract invalid: ${validation.errors.join(',')}`);
      return createEmptyConversationPlanSnapshot({ shadowMode });
    }
    return snapshot;
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'CONVERSATION_PLANNER_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    return createEmptyConversationPlanSnapshot({
      shadowMode: Boolean(safeContext.shadowMode ?? true),
      plannerStatus: 'FALLBACK',
    });
  }
}
