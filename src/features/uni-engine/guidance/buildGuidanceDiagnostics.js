// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// Diagnóstico redigido para auditoria interna do snapshot de guidances.
// Apenas status, razões e agregados — nunca texto completo, IDs, contas,
// categorias, valores ou memória. Nunca exibido ao usuário e nunca
// persistido.
import { GUIDANCE_CAPABILITIES } from './guidanceTypes.js';

const DIAGNOSTIC_CODES = Object.freeze([
  'GUIDANCE_COMPUTED',
  'GUIDANCE_APPLIED_CANDIDATE',
  'GUIDANCE_LEGACY_MISSING',
  'GUIDANCE_PROTECTED_RESPONSE',
  'GUIDANCE_NOT_COMPUTED',
  'UNKNOWN',
]);

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

const SAFE_METADATA_KEYS = Object.freeze([
  'capability',
  'applied',
  'observational',
  'styleKey',
  'lengthBand',
  'questionKey',
  'clarificationKey',
]);

function isValidCode(code) {
  return DIAGNOSTIC_CODES.includes(code);
}

function isValidSeverity(severity) {
  return SEVERITIES.includes(severity);
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object') return {};
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

export function createGuidanceDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const capability = typeof safe.capability === 'string' ? safe.capability : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const metadata = sanitizeMetadata(safe.metadata);

  return Object.freeze({
    code,
    severity,
    module: 'guidance',
    capability,
    reason,
    source: 'guidance',
    observational: true,
    metadata,
  });
}

// Deriva o código de diagnóstico de uma guidance calculada.
function codeForGuidance(guidance) {
  if (!guidance) return 'GUIDANCE_NOT_COMPUTED';
  if (guidance.reason === 'LEGACY_MISSING') return 'GUIDANCE_LEGACY_MISSING';
  if (guidance.reason === 'PROTECTED_RESPONSE') return 'GUIDANCE_PROTECTED_RESPONSE';
  if (guidance.applied) return 'GUIDANCE_APPLIED_CANDIDATE';
  return 'GUIDANCE_COMPUTED';
}

function metadataForGuidance(capability, guidance) {
  const metadata = { capability, applied: Boolean(guidance?.applied), observational: true };
  if (guidance?.styleKey) metadata.styleKey = guidance.styleKey;
  if (guidance?.lengthBand) metadata.lengthBand = guidance.lengthBand;
  if (guidance?.questionKey) metadata.questionKey = guidance.questionKey;
  if (guidance?.clarificationKey) metadata.clarificationKey = guidance.clarificationKey;
  return metadata;
}

export function buildGuidanceDiagnostics({ guidances = null } = {}) {
  try {
    const safe = guidances && typeof guidances === 'object' ? guidances : {};
    const diagnostics = [];
    for (const capability of GUIDANCE_CAPABILITIES) {
      const guidance = safe[capability] ?? null;
      const reason = guidance?.reason ?? null;
      diagnostics.push(createGuidanceDiagnostic({
        code: codeForGuidance(guidance),
        severity: codeForGuidance(guidance) === 'GUIDANCE_NOT_COMPUTED' ? 'WARNING' : 'INFO',
        capability,
        reason,
        metadata: metadataForGuidance(capability, guidance),
      }));
    }
    return Object.freeze(diagnostics);
  } catch {
    return Object.freeze([]);
  }
}
