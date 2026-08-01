// Modelo Epistêmico do Uni Engine (Fase 4 — Shadow Mode).
//
// Representação explícita de: o que a Uni sabe, de onde sabe, com qual
// confiança, o que foi confirmado/afirmado/inferido/hipótese/ausente/
// desatualizado/conflitante. Tudo permanece em Shadow Mode — nada altera
// resposta, execução, memória ou pipeline.
//
// Regras absolutas:
//   - `usableFor.execution` e `appliedToDecision` permanecem SEMPRE falso;
//   - verificador puro, síncrono, sem rede e sem LLM;
//   - memória da Fase 3 entra APENAS como evidência;
//   - FinancialSnapshot é fonte oficial do contexto financeiro derivado.
export {
  EPISTEMIC_SOURCES,
  EPISTEMIC_CLAIM_TYPES,
  EPISTEMIC_STATUSES,
  EPISTEMIC_EVIDENCE_TYPES,
  EPISTEMIC_CONFLICT_TYPES,
  EPISTEMIC_STALENESS_STATES,
  EPISTEMIC_SUFFICIENCY_PURPOSES,
  EPISTEMIC_USAGE_RESULTS,
  EPISTEMIC_USABLE_FOR_CAPABILITIES,
  EPISTEMIC_CONFIDENCE_BANDS,
  LEGACY_EPISTEMIC_STATUSES,
  LEGACY_STATUS_MIGRATION,
  isValidEpistemicSource,
  isValidEpistemicClaimType,
  isValidEpistemicStatus,
  isValidEpistemicEvidenceType,
  isValidEpistemicConflictType,
  isValidEpistemicStalenessState,
  isValidEpistemicSufficiencyPurpose,
  isValidEpistemicUsageResult,
  mapLegacyEpistemicStatus,
  describeEpistemicConfidence,
} from './epistemicTypes.js';
export {
  EPISTEMIC_MODEL_VERSION,
  buildEvidenceKey,
  createEpistemicEvidence,
  validateEpistemicEvidence,
  createEpistemicItem,
  validateEpistemicItem,
  serializeEpistemicItem,
  isValidEpistemicConfidence,
  confidenceBandOf,
  createEpistemicModelSection,
} from './epistemicContracts.js';
export {
  EPISTEMIC_POLICY,
  clamp01,
  clampMinusOneOne,
  getSourcePriority,
  getEvidenceWeight,
  stalenessDomainForSubject,
  stalenessWindowMs,
  describeConfidence,
  resolveEpistemicPriority,
} from './epistemicPolicy.js';
export {
  evidenceFromDatabaseRecord,
  evidenceFromFinancialSnapshot,
  evidenceFromUserStatement,
  evidenceFromUserConfirmation,
  evidenceFromUserCorrection,
  evidenceFromMemoryRetrieval,
  evidenceFromContextReference,
  evidenceFromDeterministicRule,
  evidenceFromContradiction,
  dedupeEvidence,
} from './buildEpistemicEvidence.js';
export { computeEpistemicConfidence } from './computeEpistemicConfidence.js';
export {
  evaluateStaleness,
  stalenessWindowForItem,
  isStaleItem,
} from './evaluateStaleness.js';
export {
  detectEpistemicConflict,
  summarizeConflict,
} from './detectEpistemicConflict.js';
export { evaluateEvidenceSufficiency } from './evaluateEvidenceSufficiency.js';
export {
  computeUsableFor,
  resolveEpistemicUsage,
} from './resolveEpistemicUsage.js';
export {
  runEpistemicVerifier,
  buildPlanEpistemicSection,
} from './runEpistemicVerifier.js';
export {
  buildEpistemicTelemetry,
  emitEpistemicTelemetry,
} from './telemetry/epistemicTelemetry.js';
export {
  EPISTEMIC_TELEMETRY_ALLOWED_FIELDS,
  redactEpistemicTelemetry,
  buildRedactedEpistemicTelemetryEntry,
  redactEpistemicText,
  redactEpistemicSensitiveValue,
} from './telemetry/redactEpistemicTelemetry.js';
