// Uni Engine — Controlled Rollout: diagnostics (Parte 10, Bloco Único).
//
// Diagnóstico redigido para o módulo de rollout e prontidão operacional.
// Apenas códigos, severidades e agregados técnicos — nunca texto de resposta,
// IDs, valores de usuário. Nunca exibido ao usuário e nunca persistido.
import { deepFreeze } from '../cognitive-orchestrator/cognitiveOrchestratorContracts.js';

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

const STAGE_CODE_MAP = Object.freeze({
  ROLLOUT_OFF: 'ROLLOUT_DISABLED',
  ROLLOUT_SHADOW: 'ROLLOUT_SHADOW_ACTIVE',
  ROLLOUT_INTERNAL: 'ROLLOUT_INTERNAL_ENABLED',
  ROLLOUT_CANARY: 'ROLLOUT_CANARY_ENABLED',
  ROLLOUT_BLOCKED: 'ROLLOUT_BLOCKED',
});

function isValidCode(code) {
  return Object.values(STAGE_CODE_MAP).includes(code);
}

function isValidSeverity(severity) {
  return SEVERITIES.includes(severity);
}

function isRolloutStage(value) {
  return ROLLOUT_STAGES.includes(value);
}

function isOperationalStatus(value) {
  return OPERATIONAL_STATUSES.includes(value);
}

export function createRolloutDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const stage = typeof safe.stage === 'string' ? safe.stage : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const source = typeof safe.source === 'string' ? safe.source : 'rollout';
  return deepFreeze({
    code,
    severity,
    module: 'rollout',
    stage,
    reason,
    source,
    observational: true,
  });
}

function deduplicate(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = `${item.code}:${item.reason ?? ''}:${item.stage ?? ''}:${item.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 12) break;
  }
  return result;
}

export function buildRolloutDiagnostics({
  requestedStage = 'ROLLOUT_OFF',
  effectiveStage = 'ROLLOUT_OFF',
  eligible = false,
  visibleInfluenceAllowed = false,
  environmentAllowed = false,
  userAuthorized = false,
  rolloutEnabled = false,
} = {}) {
  try {
    const diagnostics = [];

    const stageCode = STAGE_CODE_MAP[requestedStage] ?? 'ROLLOUT_UNKNOWN';
    diagnostics.push(createRolloutDiagnostic({
      code: stageCode,
      severity: requestedStage === 'ROLLOUT_BLOCKED' ? 'ERROR' : 'INFO',
      reason: requestedStage.toLowerCase(),
      source: 'rollout',
    }));

    if (!rolloutEnabled) {
      diagnostics.push(createRolloutDiagnostic({
        code: 'ROLLOUT_DISABLED',
        severity: 'WARNING',
        reason: 'rollout feature flag desativada',
        stage: requestedStage,
        source: 'rollout',
      }));
    }

    if (!environmentAllowed) {
      diagnostics.push(createRolloutDiagnostic({
        code: 'ENVIRONMENT_NOT_ALLOWED',
        severity: 'WARNING',
        reason: 'ambiente não permitido',
        stage: requestedStage,
        source: 'rollout',
      }));
    }

    if (!userAuthorized) {
      diagnostics.push(createRolloutDiagnostic({
        code: 'USER_NOT_AUTHORIZED',
        severity: 'WARNING',
        reason: 'usuário não autorizado',
        stage: requestedStage,
        source: 'rollout',
      }));
    }

    if (!eligible) {
      diagnostics.push(createRolloutDiagnostic({
        code: 'INELIGIBLE',
        severity: 'WARNING',
        reason: 'gates não atendidas',
        stage: requestedStage,
        source: 'rollout',
      }));
    }

    if (effectiveStage !== requestedStage) {
      diagnostics.push(createRolloutDiagnostic({
        code: 'STAGE_MISMATCH',
        severity: 'INFO',
        reason: 'requestedStage ≠ effectiveStage',
        stage: requestedStage,
        source: 'rollout',
      }));
    }

    return deepFreeze(deduplicate(diagnostics));
  } catch {
    return deepFreeze([]);
  }
}