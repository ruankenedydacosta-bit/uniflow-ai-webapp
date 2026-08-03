// Uni Engine — Cognitive Orchestrator: diagnósticos (Parte 9, Bloco Único).
//
// Diagnóstico redigido do orquestrador. Apenas códigos, severidades e
// agregados técnicos — nunca texto de resposta, IDs, contas, valores ou
// memória. Nunca exibido ao usuário e nunca persistido.
import { deepFreeze } from './cognitiveOrchestratorContracts.js';
import {
  ORCHESTRATOR_DIAGNOSTIC_CODES,
  ORCHESTRATOR_LAYERS,
} from './cognitiveOrchestratorTypes.js';

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

const LAYER_MISSING_MAP = Object.freeze({
  observation: 'OBSERVATION_MISSING',
  guidance: 'GUIDANCE_MISSING',
  decision: 'DECISION_MISSING',
  capabilityReadiness: 'CAPABILITY_READINESS_MISSING',
  executionReadiness: 'EXECUTION_READINESS_MISSING',
  application: 'APPLICATION_MISSING',
  conversationPlan: 'CONVERSATION_PLAN_MISSING',
  conversationRoute: 'CONVERSATION_ROUTE_MISSING',
});

const LAYER_INVALID_MAP = Object.freeze({
  observation: 'OBSERVATION_INVALID',
  guidance: 'GUIDANCE_INVALID',
  decision: 'DECISION_INVALID',
  capabilityReadiness: 'CAPABILITY_READINESS_INVALID',
  executionReadiness: 'EXECUTION_READINESS_INVALID',
  application: 'APPLICATION_INVALID',
  conversationPlan: 'CONVERSATION_PLAN_INVALID',
  conversationRoute: 'CONVERSATION_ROUTE_INVALID',
});

function isValidCode(code) {
  return ORCHESTRATOR_DIAGNOSTIC_CODES.includes(code);
}

function isValidSeverity(severity) {
  return SEVERITIES.includes(severity);
}

export function createCognitiveOrchestratorDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const layer = typeof safe.layer === 'string' ? safe.layer : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const source = typeof safe.source === 'string' ? safe.source : 'cognitive-orchestrator';
  return deepFreeze({
    code,
    severity,
    module: 'cognitive-orchestrator',
    layer,
    reason,
    source,
    observational: true,
  });
}

function deduplicate(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = `${item.code}:${item.reason ?? ''}:${item.layer ?? ''}:${item.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 12) break;
  }
  return result;
}

export function buildCognitiveOrchestratorDiagnostics({
  orchestratorStatus = 'EMPTY',
  validLayers = [],
  missingLayers = [],
  invalidLayers = [],
  sameTurnViolated = false,
  shadowMode = true,
  legacyPreserved = true,
} = {}) {
  try {
    const diagnostics = [];

    const statusCodeMap = {
      ORCHESTRATED: 'ORCHESTRATOR_ORCHESTRATED',
      PARTIAL: 'ORCHESTRATOR_PARTIAL',
      EMPTY: 'ORCHESTRATOR_EMPTY',
      FALLBACK: 'ORCHESTRATOR_FALLBACK',
    };
    const statusCode = statusCodeMap[orchestratorStatus] ?? 'ORCHESTRATOR_EMPTY';
    diagnostics.push(createCognitiveOrchestratorDiagnostic({
      code: statusCode,
      severity: orchestratorStatus === 'FALLBACK' ? 'ERROR' : 'INFO',
      reason: orchestratorStatus.toLowerCase(),
      source: 'cognitive-orchestrator',
    }));

    for (const layer of ORCHESTRATOR_LAYERS) {
      if (missingLayers.includes(layer)) {
        diagnostics.push(createCognitiveOrchestratorDiagnostic({
          code: LAYER_MISSING_MAP[layer],
          severity: 'WARNING',
          reason: 'layer_missing',
          layer,
          source: 'cognitive-orchestrator',
        }));
      }
      if (invalidLayers.includes(layer)) {
        diagnostics.push(createCognitiveOrchestratorDiagnostic({
          code: LAYER_INVALID_MAP[layer],
          severity: 'ERROR',
          reason: 'layer_invalid',
          layer,
          source: 'cognitive-orchestrator',
        }));
      }
    }

    if (sameTurnViolated) {
      diagnostics.push(createCognitiveOrchestratorDiagnostic({
        code: 'SAME_TURN_VIOLATED',
        severity: 'WARNING',
        reason: 'same_turn_required',
        layer: 'conversationRoute',
        source: 'cognitive-orchestrator',
      }));
    }

    if (shadowMode) {
      diagnostics.push(createCognitiveOrchestratorDiagnostic({
        code: 'SHADOW_MODE',
        severity: 'INFO',
        reason: 'shadow_mode_active',
        source: 'cognitive-orchestrator',
      }));
    }

    if (legacyPreserved) {
      diagnostics.push(createCognitiveOrchestratorDiagnostic({
        code: 'LEGACY_PRESERVED',
        severity: 'INFO',
        reason: 'legacy_preserved',
        source: 'cognitive-orchestrator',
      }));
    }

    return deepFreeze(deduplicate(diagnostics));
  } catch {
    return deepFreeze([]);
  }
}