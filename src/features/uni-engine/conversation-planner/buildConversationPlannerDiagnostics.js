// Uni Engine — Conversation Planner: diagnósticos (Parte 7, Bloco Único).
//
// Diagnóstico redigido do plano de conversa. Apenas códigos, severidades e
// agregados técnicos — nunca texto de resposta, IDs, contas, valores ou
// memória. Nunca exibido ao usuário e nunca persistido.
import { deepFreeze } from './conversationPlannerContracts.js';
import { PLANNER_DIAGNOSTIC_CODES } from './conversationPlannerTypes.js';

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

const SAFE_METADATA_KEYS = Object.freeze([
  'source',
  'count',
  'nextStep',
  'shadowMode',
]);

function isValidCode(code) {
  return PLANNER_DIAGNOSTIC_CODES.includes(code);
}

function isValidSeverity(severity) {
  return SEVERITIES.includes(severity);
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_METADATA_KEYS.includes(key)) continue;
    if (item === null || item === undefined) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    }
  }
  return sanitized;
}

export function createConversationPlannerDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const nextStep = typeof safe.nextStep === 'string' ? safe.nextStep : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const source = typeof safe.source === 'string' ? safe.source : 'conversation-planner';
  const metadata = sanitizeMetadata(safe.metadata);

  return deepFreeze({
    code,
    severity,
    module: 'conversation-planner',
    nextStep,
    reason,
    source,
    observational: true,
    metadata,
  });
}

function deduplicate(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = `${item.code}:${item.reason ?? ''}:${item.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 12) break;
  }
  return result;
}

export function buildConversationPlannerDiagnostics({
  nextStep = null,
  observationAvailable = true,
  shadowMode = false,
  legacyPreserved = true,
  applied = false,
} = {}) {
  try {
    const diagnostics = [];

    diagnostics.push(createConversationPlannerDiagnostic({
      code: 'CONVERSATION_PLAN_COMPUTED',
      severity: 'INFO',
      reason: 'conversation_plan_built',
      source: 'conversation-planner',
      metadata: { count: 1 },
    }));

    if (!observationAvailable) {
      diagnostics.push(createConversationPlannerDiagnostic({
        code: 'NO_OBSERVATION_SNAPSHOT',
        severity: 'WARNING',
        reason: 'no_observation_snapshot',
        source: 'conversation-planner',
      }));
    }

    const nextStepCodes = {
      NEXT_STEP_ANSWER: 'NEXT_STEP_ANSWER_PLANNED',
      NEXT_STEP_QUESTION: 'NEXT_STEP_QUESTION_PLANNED',
      NEXT_STEP_CLARIFICATION: 'NEXT_STEP_CLARIFICATION_PLANNED',
      NEXT_STEP_CONFIRMATION: 'NEXT_STEP_CONFIRMATION_PLANNED',
      NEXT_STEP_WAIT: 'NEXT_STEP_WAIT_PLANNED',
    };
    if (nextStep && nextStepCodes[nextStep]) {
      diagnostics.push(createConversationPlannerDiagnostic({
        code: nextStepCodes[nextStep],
        severity: 'INFO',
        reason: 'next_step_planned',
        source: 'conversation-planner',
        metadata: { nextStep },
      }));
    } else {
      diagnostics.push(createConversationPlannerDiagnostic({
        code: 'NO_NEXT_STEP_PLANNED',
        severity: 'INFO',
        reason: 'no_next_step_planned',
        source: 'conversation-planner',
      }));
    }

    if (shadowMode) {
      diagnostics.push(createConversationPlannerDiagnostic({
        code: 'SHADOW_MODE',
        severity: 'INFO',
        reason: 'shadow_mode_active',
        source: 'config',
        metadata: { shadowMode: true },
      }));
    }

    if (legacyPreserved) {
      diagnostics.push(createConversationPlannerDiagnostic({
        code: 'LEGACY_PRESERVED',
        severity: 'INFO',
        reason: 'legacy_preserved',
        source: 'conversation-planner',
      }));
    }

    if (!applied) {
      diagnostics.push(createConversationPlannerDiagnostic({
        code: 'NOTHING_APPLIED',
        severity: 'INFO',
        reason: 'nothing_applied',
        source: 'conversation-planner',
      }));
    }

    return deepFreeze(deduplicate(diagnostics));
  } catch {
    return deepFreeze([]);
  }
}
