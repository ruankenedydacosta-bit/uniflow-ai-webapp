// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// Contrato puro do snapshot consolidado das guidances. Garantias:
//   - SOMENTE em memória: nenhuma função, nenhum cliente externo, nenhuma
//     referência circular — sempre serializável;
//   - `legacyPreserved` é SEMPRE true (o módulo nunca altera a resposta);
//   - `mode` é SEMPRE 'observational' (nada é aplicado);
//   - nenhum dado sensível (texto, IDs, valores, memória) no snapshot.
import { isSerializableValue } from '../uniEngineContracts.js';
import { GUIDANCE_VERSION, isGuidanceMode } from './guidanceTypes.js';
import { buildGuidanceDiagnostics } from './buildGuidanceDiagnostics.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Sanitiza cada guidance: mantém apenas valores primitivos e listas de
// strings limitadas — nunca texto livre arbitrário, nunca referências.
function sanitizeGuidance(value) {
  if (!isPlainObject(value)) return null;
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      sanitized[key] = item
        .filter((entry) => typeof entry === 'string')
        .slice(0, 8);
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeDiagnostic(value) {
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (isPlainObject(item)) {
      sanitized[key] = sanitizeGuidance(item);
    }
  }
  return sanitized;
}

function sanitizeDiagnostics(list) {
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const item of list) {
    if (item && typeof item === 'object') {
      result.push(sanitizeDiagnostic(item));
    }
    if (result.length >= 12) break;
  }
  return result;
}

export function createEmptyGuidanceSnapshot() {
  return {
    version: GUIDANCE_VERSION,
    mode: 'observational',
    legacyPreserved: true,
    capabilitiesComputed: [],
    questionGuidance: null,
    clarificationGuidance: null,
    styleGuidance: null,
    lengthGuidance: null,
    diagnostics: [],
    serializable: true,
  };
}

export function createGuidanceSnapshot(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const questionGuidance = sanitizeGuidance(safe.questionGuidance);
  const clarificationGuidance = sanitizeGuidance(safe.clarificationGuidance);
  const styleGuidance = sanitizeGuidance(safe.styleGuidance);
  const lengthGuidance = sanitizeGuidance(safe.lengthGuidance);
  const diagnostics = sanitizeDiagnostics(safe.diagnostics);

  const capabilitiesComputed = [];
  if (questionGuidance) capabilitiesComputed.push('QUESTION_GUIDANCE');
  if (clarificationGuidance) capabilitiesComputed.push('CLARIFICATION_GUIDANCE');
  if (styleGuidance) capabilitiesComputed.push('RESPONSE_STYLE_GUIDANCE');
  if (lengthGuidance) capabilitiesComputed.push('RESPONSE_LENGTH_GUIDANCE');

  return {
    version: GUIDANCE_VERSION,
    mode: 'observational',
    legacyPreserved: true,
    capabilitiesComputed,
    questionGuidance,
    clarificationGuidance,
    styleGuidance,
    lengthGuidance,
    diagnostics,
    serializable: true,
  };
}

export function validateGuidanceSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  }
  const errors = [];
  if (snapshot.version !== GUIDANCE_VERSION) {
    errors.push('VERSION_INVALID');
  }
  if (!isGuidanceMode(snapshot.mode) || snapshot.mode !== 'observational') {
    errors.push('MODE_NOT_OBSERVATIONAL');
  }
  if (snapshot.legacyPreserved !== true) {
    errors.push('LEGACY_PRESERVED_FALSE');
  }
  if (!Array.isArray(snapshot.capabilitiesComputed)) {
    errors.push('CAPABILITIES_NOT_ARRAY');
  }
  if (!Array.isArray(snapshot.diagnostics)) {
    errors.push('DIAGNOSTICS_NOT_ARRAY');
  }
  if (snapshot.serializable !== true) {
    errors.push('SERIALIZABLE_FALSE');
  }
  if (!isSerializableValue(snapshot)) {
    errors.push('SNAPSHOT_NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function isGuidanceSnapshotSerializable(snapshot) {
  return isSerializableValue(snapshot);
}

export { buildGuidanceDiagnostics };
