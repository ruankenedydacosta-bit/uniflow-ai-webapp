// Uni Engine — Cognitive Comparison (Fase 14, Bloco 3). Contratos.
//
// Objeto serializável e congelado com a comparação legado × Engine de um
// MESMO turno: turnId, messageId, intents, rotas, ações, status de
// concordância, divergência, severidade, códigos de razão, timestamps e a
// indicação explícita de que NENHUMA influência foi aplicada. Sempre sem
// texto completo, sem dados pessoais, sem tokens, sem áudio.
import {
  COGNITIVE_COMPARISON_REASON_CODES,
  COGNITIVE_COMPARISON_VERSION,
  COGNITIVE_DIVERGENCE_SEVERITIES,
  COGNITIVE_DIVERGENCE_TYPES,
  isCognitiveAgreementStatus,
  isCognitiveDivergenceSeverity,
} from './cognitiveComparisonTypes.js';

function safeEnumValue(value, allowed) {
  return Array.isArray(allowed) && allowed.includes(value) ? value : null;
}

export function createEmptyCognitiveComparison({ turnId = null, messageId = null } = {}) {
  return Object.freeze({
    version: COGNITIVE_COMPARISON_VERSION,
    turnId: typeof turnId === 'string' ? turnId : null,
    messageId: typeof messageId === 'string' ? messageId : null,
    legacyIntent: null,
    engineIntent: null,
    legacyRoute: null,
    engineRoute: null,
    legacyAction: null,
    engineSuggestedAction: null,
    agreementStatus: 'skipped',
    agreement: false,
    confidence: null,
    divergenceType: null,
    divergenceSeverity: null,
    reasonCodes: Object.freeze([]),
    engineErrorCode: null,
    engineSkipped: true,
    influenceApplied: false,
    legacyPreserved: true,
    timestamp: null,
    durationMs: null,
  });
}

export function createCognitiveComparison(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const legacy = safe.legacy && typeof safe.legacy === 'object' ? safe.legacy : {};
  const engine = safe.engine && typeof safe.engine === 'object' ? safe.engine : {};

  const statusValue =
    safe.engineSkipped === true
      ? 'skipped'
      : isCognitiveAgreementStatus(safe.agreementStatus)
        ? safe.agreementStatus
        : 'insufficient_data';
  const reasonCodes = filterReasonCodes(safe.reasonCodes);
  const timestamp =
    typeof safe.timestamp === 'string'
      ? safe.timestamp
      : typeof safe.timestamp === 'number'
        ? new Date(safe.timestamp).toISOString()
        : null;
  const durationMs =
    typeof safe.durationMs === 'number' && Number.isFinite(safe.durationMs)
      ? Number(safe.durationMs.toFixed(2))
      : null;
  const confidence =
    typeof safe.confidence === 'number' && Number.isFinite(safe.confidence)
      ? Number(Math.max(0, Math.min(1, safe.confidence)).toFixed(3))
      : null;

  return Object.freeze({
    version: COGNITIVE_COMPARISON_VERSION,
    turnId: typeof safe.turnId === 'string' ? safe.turnId : null,
    messageId: typeof safe.messageId === 'string' ? safe.messageId : null,
    legacyIntent: typeof legacy.intent === 'string' ? legacy.intent : null,
    engineIntent: typeof engine.intent === 'string' ? engine.intent : null,
    legacyRoute: typeof legacy.route === 'string' ? legacy.route : null,
    engineRoute: typeof engine.route === 'string' ? engine.route : null,
    legacyAction: typeof legacy.action === 'string' ? legacy.action : null,
    engineSuggestedAction:
      typeof engine.suggestedAction === 'string' ? engine.suggestedAction : null,
    agreementStatus: statusValue,
    agreement: Boolean(safe.agreement),
    confidence,
    divergenceType: safeEnumValue(safe.divergenceType, COGNITIVE_DIVERGENCE_TYPES),
    divergenceSeverity: safeEnumValue(
      safe.divergenceSeverity,
      COGNITIVE_DIVERGENCE_SEVERITIES,
    ),
    reasonCodes: Object.freeze(reasonCodes),
    engineErrorCode: typeof safe.engineErrorCode === 'string' ? safe.engineErrorCode : null,
    engineSkipped: Boolean(safe.engineSkipped),
    influenceApplied: false,
    legacyPreserved: true,
    timestamp,
    durationMs,
  });
}

// Filtra códigos de razão pelo vocabulário fechado, deduplica e limita.
function filterReasonCodes(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input)]
    .filter((code) => COGNITIVE_COMPARISON_REASON_CODES.includes(code))
    .slice(0, 12);
}

export function validateCognitiveComparison(comparison) {
  const safe = comparison && typeof comparison === 'object' ? comparison : null;
  if (!safe) return { valid: false, errors: ['COMPARISON_INVALID'] };
  const errors = [];
  if (safe.version !== COGNITIVE_COMPARISON_VERSION) {
    errors.push('VERSION_MISMATCH');
  }
  if (!isCognitiveAgreementStatus(safe.agreementStatus)) {
    errors.push('AGREEMENT_STATUS_INVALID');
  }
  if (safe.divergenceType && !COGNITIVE_DIVERGENCE_TYPES.includes(safe.divergenceType)) {
    errors.push('DIVERGENCE_TYPE_INVALID');
  }
  if (
    safe.divergenceSeverity
    && !isCognitiveDivergenceSeverity(safe.divergenceSeverity)
  ) {
    errors.push('DIVERGENCE_SEVERITY_INVALID');
  }
  if (safe.influenceApplied !== false) {
    errors.push('INFLUENCE_MUST_BE_FALSE');
  }
  if (safe.legacyPreserved !== true) {
    errors.push('LEGACY_MUST_BE_PRESERVED');
  }
  return { valid: errors.length === 0, errors };
}

export function isCognitiveComparisonSerializable(comparison) {
  try {
    const clone = JSON.parse(JSON.stringify(comparison));
    return clone != null && typeof clone === 'object';
  } catch {
    return false;
  }
}