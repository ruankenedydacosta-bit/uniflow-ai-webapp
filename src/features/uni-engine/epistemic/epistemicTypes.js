// Tipos fechados do Modelo Epistêmico (Fase 4 — Shadow Mode).
//
// Enums fechados e validados — nenhum valor fora destas listas é aceito
// pelos contratos epistêmicos. Os enums da Fase 1 (UNI_ENGINE_EPISTEMIC_STATUSES)
// permanecem INTACTOS no contrato do motor; este módulo define o modelo
// explícito da Fase 4 e a migração determinística dos estados antigos.
//
// Princípio: nenhum conceito da Fase 1/2/3 é duplicado aqui — eles são
// estendidos e mapeados, nunca reimplementados.

// -----------------------------------------------
// Fontes de conhecimento (seção 2 da especificação)
// -----------------------------------------------
export const EPISTEMIC_SOURCES = Object.freeze([
  'database_record',
  'financial_snapshot',
  'user_explicit_statement',
  'user_confirmation',
  'user_correction',
  'conversation_context',
  'persistent_memory',
  'operational_memory',
  'deterministic_inference',
  'system_rule',
  'external_source',
  'unknown',
]);

// -----------------------------------------------
// Tipos de afirmação (seção 3)
// -----------------------------------------------
export const EPISTEMIC_CLAIM_TYPES = Object.freeze([
  'fact',
  'user_claim',
  'inference',
  'hypothesis',
  'preference',
  'correction',
  'absence',
  'conflict',
  'temporal_state',
]);

// -----------------------------------------------
// Estados epistêmicos (seção 4)
// -----------------------------------------------
export const EPISTEMIC_STATUSES = Object.freeze([
  'confirmed',
  'supported',
  'probable',
  'possible',
  'hypothesis',
  'missing',
  'ambiguous',
  'conflicting',
  'stale',
  'invalid',
  'unknown',
]);

// Estados legados da Fase 1 que este modelo migra (referência explícita).
export const LEGACY_EPISTEMIC_STATUSES = Object.freeze([
  'confirmed_database',
  'confirmed_user',
  'inferred_high',
  'inferred_low',
  'ambiguous',
  'missing',
  'stale',
  'conflicting',
]);

// -----------------------------------------------
// Evidências (seção 6)
// -----------------------------------------------
export const EPISTEMIC_EVIDENCE_TYPES = Object.freeze([
  'direct_database',
  'direct_user_statement',
  'user_confirmation',
  'user_correction',
  'repeated_observation',
  'memory_retrieval',
  'context_reference',
  'deterministic_rule',
  'contradicting_evidence',
]);

// -----------------------------------------------
// Conflitos (seção 10)
// -----------------------------------------------
export const EPISTEMIC_CONFLICT_TYPES = Object.freeze([
  'value_conflict',
  'source_conflict',
  'temporal_conflict',
  'identity_conflict',
  'scope_conflict',
  'memory_database_conflict',
  'user_database_conflict',
  'user_memory_conflict',
]);

// -----------------------------------------------
// Temporalidade (seção 11)
// -----------------------------------------------
export const EPISTEMIC_STALENESS_STATES = Object.freeze([
  'fresh',
  'aging',
  'stale',
  'expired',
]);

// -----------------------------------------------
// Suficiência de evidência (seção 9)
// -----------------------------------------------
export const EPISTEMIC_SUFFICIENCY_PURPOSES = Object.freeze([
  'display',
  'suggest',
  'ask',
  'confirm',
  'execute',
  'store_memory',
]);

// -----------------------------------------------
// Política de uso (seção 15)
// -----------------------------------------------
export const EPISTEMIC_USAGE_RESULTS = Object.freeze([
  'use_for_display',
  'use_for_suggestion',
  'ask_user',
  'require_confirmation',
  'ignore',
  'block',
  'refresh_data',
]);

// Capacidades de uso de uma afirmação (contrato `usableFor`).
export const EPISTEMIC_USABLE_FOR_CAPABILITIES = Object.freeze([
  'display',
  'suggestion',
  'question',
  'confirmation',
  'execution',
  'memory_candidate',
  'none',
]);

// -----------------------------------------------
// Faixas de confiança (seção 8)
// -----------------------------------------------
export const EPISTEMIC_CONFIDENCE_BANDS = Object.freeze([
  { label: 'insufficient', min: 0.0, max: 0.24 },
  { label: 'low', min: 0.25, max: 0.49 },
  { label: 'moderate', min: 0.5, max: 0.69 },
  { label: 'high', min: 0.7, max: 0.89 },
  { label: 'very_high', min: 0.9, max: 1.0 },
]);

// -----------------------------------------------
// Validadores
// -----------------------------------------------
function isValid(value, list) {
  return Array.isArray(list) && list.includes(value);
}

export function isValidEpistemicSource(value) {
  return isValid(value, EPISTEMIC_SOURCES);
}

export function isValidEpistemicClaimType(value) {
  return isValid(value, EPISTEMIC_CLAIM_TYPES);
}

export function isValidEpistemicStatus(value) {
  return isValid(value, EPISTEMIC_STATUSES);
}

export function isValidEpistemicEvidenceType(value) {
  return isValid(value, EPISTEMIC_EVIDENCE_TYPES);
}

export function isValidEpistemicConflictType(value) {
  return isValid(value, EPISTEMIC_CONFLICT_TYPES);
}

export function isValidEpistemicStalenessState(value) {
  return isValid(value, EPISTEMIC_STALENESS_STATES);
}

export function isValidEpistemicSufficiencyPurpose(value) {
  return isValid(value, EPISTEMIC_SUFFICIENCY_PURPOSES);
}

export function isValidEpistemicUsageResult(value) {
  return isValid(value, EPISTEMIC_USAGE_RESULTS);
}

// -----------------------------------------------
// Migração determinística dos estados da Fase 1 (seção 4)
//
// Mapa de compatibilidade SEM quebrar contratos anteriores:
//   confirmed_database → confirmed
//   confirmed_user     → supported
//   inferred_high      → probable
//   inferred_low       → possible
//   missing            → missing
//   conflicting        → conflicting
//   stale              → stale
//   ambiguous          → ambiguous
export const LEGACY_STATUS_MIGRATION = Object.freeze({
  confirmed_database: 'confirmed',
  confirmed_user: 'supported',
  inferred_high: 'probable',
  inferred_low: 'possible',
  missing: 'missing',
  conflicting: 'conflicting',
  stale: 'stale',
  ambiguous: 'ambiguous',
});

export function mapLegacyEpistemicStatus(status) {
  return LEGACY_STATUS_MIGRATION[status] ?? null;
}

// Faixa conceitual de uma confiança (0..1) — política centralizada.
export function describeEpistemicConfidence(confidence) {
  const value = Number(confidence) || 0;
  for (const band of EPISTEMIC_CONFIDENCE_BANDS) {
    if (value >= band.min && value <= band.max) return band.label;
  }
  return 'insufficient';
}
