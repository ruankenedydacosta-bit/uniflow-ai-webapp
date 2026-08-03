// Uni Engine — Context Bridge (Fase 11, Bloco 2): builder principal.
//
// buildEngineResponseContext — transforma snapshots JÁ produzidos no MESMO
// turno em um contexto mínimo, seguro e consumível pelo pipeline real. É uma
// função PURA: nunca reexecuta Gateway/Integration/Observation/Guidance/
// Readiness/Application/Planner/Routing/Orchestrator/Rollout, nunca gera
// texto factual, nunca executa, nunca persiste e nunca dispara TTS.
//
// Gates (qualquer falha → influenceAllowed=false, resposta legada integral):
//   ponte habilitada (flag explícita) → gateway do mesmo turno aceito →
//   rollout efetivo INTERNAL autorizado → usuário autorizado → ambiente
//   development → orchestrator ORCHESTRATED → readiness válido → resultado
//   downstream válido → circuit breaker fechado → confiança/risco permitidos
//   → confirmação obrigatória preservada → capability individual habilitada.
import {
  CONTEXT_BRIDGE_VERSION,
  ALLOWED_CONTEXT_INFLUENCES,
  CONTEXT_BRIDGE_FALLBACK_REASONS,
} from './contextBridgeTypes.js';
import {
  CONTEXT_BRIDGE_POLICY,
  isBridgeEnabledByPolicy,
  isEnvironmentAllowedByBridgePolicy,
  isUserAuthorizedByBridgePolicy,
  isRolloutInternalAuthorizedByBridgePolicy,
  rolloutStageOf,
  isOrchestratorValidByBridgePolicy,
  isReadinessValidByBridgePolicy,
  isConfidenceAllowedByBridgePolicy,
  isRiskAllowedByBridgePolicy,
} from './contextBridgePolicy.js';
import {
  createBridgeContext,
  createEmptyBridgeContext,
  validateBridgeContext,
  isBridgeContextSerializable,
  deepFreeze,
} from './contextBridgeContracts.js';
import { buildContextBridgeDiagnostics } from './buildContextBridgeDiagnostics.js';
import { selectSafeEngineInfluence } from './selectSafeEngineInfluence.js';
import { ROUTES } from '../conversation-routing/conversationRoutingTypes.js';

const STYLE_ALLOWED = Object.freeze(['simple', 'normal', 'detailed']);
const LENGTH_BANDS_ALLOWED = Object.freeze(['short', 'normal', 'detailed']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] context-bridge ${message}`);
  }
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim() !== '' && out.length < CONTEXT_BRIDGE_POLICY.maxDecisionListItems) {
      out.push(item.trim().slice(0, CONTEXT_BRIDGE_POLICY.maxReasonLength));
    }
  }
  return out;
}

// Decisões observacionais sanitizadas (Question/Clarification): apenas campos
// fechados, com listas limitadas e sem nenhum texto de resposta.
function sanitizeDecision(value, kind) {
  if (!isPlainObject(value)) return null;
  const out = {};
  const rules = kind === 'question'
    ? {
        shouldAsk: 'boolean',
        confidence: 'number',
        priority: 'string',
        reason: 'string',
        missingInformation: 'list',
      }
    : {
        shouldClarify: 'boolean',
        confidence: 'number',
        priority: 'string',
        reason: 'string',
        ambiguousFields: 'list',
      };
  for (const [key, type] of Object.entries(rules)) {
    if (Object.keys(out).length >= CONTEXT_BRIDGE_POLICY.maxDecisionFields) break;
    if (value[key] === undefined || value[key] === null) continue;
    if (type === 'boolean' && typeof value[key] === 'boolean') {
      out[key] = value[key];
    } else if (type === 'number' && typeof value[key] === 'number' && Number.isFinite(value[key])) {
      out[key] = Math.min(1, Math.max(0, value[key]));
    } else if (type === 'string' && typeof value[key] === 'string' && value[key].trim() !== '') {
      out[key] = value[key].trim().slice(0, CONTEXT_BRIDGE_POLICY.maxReasonLength);
    } else if (type === 'list') {
      const list = normalizeList(value[key]);
      if (list.length > 0) out[key] = list;
    }
  }
  return Object.keys(out).length === 0 ? null : deepFreeze(out);
}

function sanitizeStyle(value) {
  return typeof value === 'string' && STYLE_ALLOWED.includes(value) ? value : null;
}

function sanitizeLengthBand(value) {
  return typeof value === 'string' && LENGTH_BANDS_ALLOWED.includes(value) ? value : null;
}

function sanitizeRoute(value) {
  return typeof value === 'string' && ROUTES.includes(value) ? value : null;
}

function isConfirmationMandatory(confirmationState) {
  if (!isPlainObject(confirmationState)) return false;
  return confirmationState.pending === true
    || typeof confirmationState.confirmationError === 'string';
}

export function buildEngineResponseContext(input = {}) {
  const safe = isPlainObject(input) ? input : {};
  const isDev = Boolean(safe.isDev);

  const finish = (data) => {
    const bridge = createBridgeContext(data);
    const serializable = isBridgeContextSerializable(bridge);
    const result = createBridgeContext({
      ...data,
      diagnostics: bridge.diagnostics,
      serializable,
    });
    if (!serializable) {
      return createEmptyBridgeContext({ fallbackReason: 'ERROR_SAFE' });
    }
    const validated = validateBridgeContext(result);
    if (!validated.valid) {
      warn(isDev, `contract invalid: ${validated.errors.join(',')}`);
      return createEmptyBridgeContext({ fallbackReason: 'ERROR_SAFE' });
    }
    return result;
  };

  const decline = (reason) => {
    const fallbackReason = CONTEXT_BRIDGE_FALLBACK_REASONS.includes(reason) ? reason : 'ERROR_SAFE';
    const requested = Array.isArray(safe.requestedInfluences) && safe.requestedInfluences.length > 0
      ? safe.requestedInfluences
      : ALLOWED_CONTEXT_INFLUENCES;
    const blockedInfluences = [];
    for (const raw of requested) {
      if (typeof raw === 'string' && raw.trim() !== '' && !blockedInfluences.includes(raw.trim().toUpperCase())) {
        blockedInfluences.push(raw.trim().toUpperCase());
      }
    }
    const data = {
      version: CONTEXT_BRIDGE_VERSION,
      enabled: isBridgeEnabledByPolicy(safe.config),
      sameTurn: Boolean(safe.sameTurn),
      influenceAllowed: false,
      allowedInfluences: [],
      blockedInfluences,
      responseStyle: null,
      responseLengthBand: null,
      questionDecision: null,
      clarificationDecision: null,
      selectedRoute: sanitizeRoute(safe.selectedRoute),
      fallbackUsed: true,
      fallbackReason,
      legacyPreserved: true,
      pendingActionPreserved: isPlainObject(safe.pendingAction),
      confirmationPreserved: isConfirmationMandatory(safe.confirmationState),
      diagnostics: buildContextBridgeDiagnostics({
        enabled: isBridgeEnabledByPolicy(safe.config),
        sameTurn: Boolean(safe.sameTurn),
        fallbackReason,
        confirmationPreserved: isConfirmationMandatory(safe.confirmationState),
        pendingActionPreserved: isPlainObject(safe.pendingAction),
      }),
      serializable: false,
    };
    return finish(data);
  };

  try {
    const config = isPlainObject(safe.config) ? safe.config : {};
    const gatewayResult = safe.gatewayResult;
    const sameTurnOK = safe.sameTurn === true
      && isPlainObject(gatewayResult)
      && gatewayResult.accepted === true
      && gatewayResult.fallbackUsed !== true;

    // Gate 1 — ponte habilitada (flag explícita; nada liga sem flag).
    if (!isBridgeEnabledByPolicy(config)) return decline('BRIDGE_DISABLED');

    // Gate 2 — gateway do mesmo turno presente e aceito.
    if (!isPlainObject(gatewayResult)) return decline('GATEWAY_ABSENT');

    // Gate 3 — mesmo turno comprovado (nunca um resultado antigo).
    if (!sameTurnOK) return decline('SAME_TURN_VIOLATED');

    // Gate 4 — rollout efetivo INTERNAL autorizado.
    const rolloutSnapshot = safe.rolloutSnapshot;
    if (!isRolloutInternalAuthorizedByBridgePolicy(rolloutSnapshot)) {
      const stage = rolloutStageOf(rolloutSnapshot);
      if (stage === 'ROLLOUT_INTERNAL') return decline('USER_NOT_AUTHORIZED');
      if (stage === 'ROLLOUT_SHADOW') return decline('ROLLOUT_SHADOW');
      if (stage === 'ROLLOUT_CANARY') return decline('ROLLOUT_CANARY');
      if (stage === 'ROLLOUT_BLOCKED') return decline('ROLLOUT_BLOCKED');
      return decline('ROLLOUT_OFF');
    }

    // Gate 5 — usuário explicitamente autorizado.
    const authorized = isUserAuthorizedByBridgePolicy({
      userId: safe.userId,
      testUserIds: config.activationTestUserIds,
    });
    if (!authorized) return decline('USER_NOT_AUTHORIZED');

    // Gate 6 — ambiente development.
    if (!isEnvironmentAllowedByBridgePolicy(safe.environment)) {
      return decline('ENVIRONMENT_NOT_ALLOWED');
    }

    // Gate 7 — orchestrator válido (ORCHESTRATED).
    if (!isOrchestratorValidByBridgePolicy(safe.cognitiveSnapshot)) {
      return decline('ORCHESTRATOR_INVALID');
    }

    // Gate 8 — readiness válido e engine efetivamente usada.
    if (!isReadinessValidByBridgePolicy(safe.operationalReadiness)) {
      return decline('READINESS_INVALID');
    }
    if (gatewayResult.diagnostics?.engineUsed !== true) {
      return decline('DOWNSTREAM_RESULT_INVALID');
    }

    // Gate 9 — resultado downstream (integration) válido.
    if (!isPlainObject(safe.integrationResult)) return decline('DOWNSTREAM_RESULT_INVALID');

    // Gate 10 — circuit breaker fechado.
    if (safe.circuitBreakerOpen === true) return decline('CIRCUIT_BREAKER_OPEN');

    // Gate 11 — confiança mínima e risco máximo permitidos.
    const confidence = safe.context?.confidence ?? safe.confidence ?? null;
    const risk = safe.context?.risk ?? safe.risk ?? null;
    if (typeof confidence === 'number' && !isConfidenceAllowedByBridgePolicy(confidence)) {
      return decline('LOW_CONFIDENCE');
    }
    if (typeof risk === 'string' && !isRiskAllowedByBridgePolicy(risk)) {
      return decline('HIGH_RISK');
    }

    // Gate 12 — confirmação obrigatória vence QUALQUER influência.
    const confirmationMandatory = isConfirmationMandatory(safe.confirmationState);
    if (confirmationMandatory) return decline('CONFIRMATION_MANDATORY');

    // Seleção individual de influências (capability habilitada por flag).
    const requested = Array.isArray(safe.requestedInfluences) && safe.requestedInfluences.length > 0
      ? safe.requestedInfluences
      : ALLOWED_CONTEXT_INFLUENCES;
    const selection = selectSafeEngineInfluence({
      requestedInfluences: requested,
      config,
    });

    // A ponte só influencia quando existe pelo menos uma capability autorizada.
    if (selection.allowedInfluences.length === 0) return decline('NO_ALLOWED_INFLUENCE');

    const applicationLayer = isPlainObject(safe.cognitiveSnapshot?.layers?.application)
      ? safe.cognitiveSnapshot.layers.application
      : null;
    const styleAllowed = selection.allowedInfluences.includes('RESPONSE_STYLE_GUIDANCE');
    const lengthAllowed = selection.allowedInfluences.includes('RESPONSE_LENGTH_GUIDANCE');
    const questionAllowed = selection.allowedInfluences.includes('QUESTION_GUIDANCE');
    const clarificationAllowed = selection.allowedInfluences.includes('CLARIFICATION_GUIDANCE');
    const data = {
      version: CONTEXT_BRIDGE_VERSION,
      enabled: true,
      sameTurn: true,
      influenceAllowed: true,
      allowedInfluences: selection.allowedInfluences,
      blockedInfluences: selection.blockedInfluences,
      responseStyle: styleAllowed ? sanitizeStyle(
        safe.context?.responseStyle ?? applicationLayer?.styleKey ?? null,
      ) : null,
      responseLengthBand: lengthAllowed ? sanitizeLengthBand(
        safe.context?.responseLengthBand ?? applicationLayer?.lengthBand ?? null,
      ) : null,
      questionDecision: questionAllowed ? sanitizeDecision(
        safe.context?.questionDecision ?? applicationLayer?.questionDecision ?? null,
        'question',
      ) : null,
      clarificationDecision: clarificationAllowed ? sanitizeDecision(
        safe.context?.clarificationDecision ?? applicationLayer?.clarificationDecision ?? null,
        'clarification',
      ) : null,
      selectedRoute: sanitizeRoute(safe.selectedRoute),
      fallbackUsed: false,
      fallbackReason: null,
      legacyPreserved: true,
      pendingActionPreserved: isPlainObject(safe.pendingAction),
      confirmationPreserved: confirmationMandatory,
      diagnostics: buildContextBridgeDiagnostics({
        influenceAllowed: true,
        allowedInfluences: selection.allowedInfluences,
        blockedInfluences: selection.blockedInfluences,
        sameTurn: true,
        enabled: true,
        confirmationPreserved: confirmationMandatory,
        pendingActionPreserved: isPlainObject(safe.pendingAction),
      }),
      serializable: false,
    };
    return finish(data);
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'CONTEXT_BRIDGE_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    return createEmptyBridgeContext({ fallbackReason: 'ERROR_SAFE' });
  }
}
