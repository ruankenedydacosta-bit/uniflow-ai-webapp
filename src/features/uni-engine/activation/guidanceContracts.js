// Activation Engine — contratos de orientação (Fase 9).
//
// Campos ESTRUTURADOS e permitidos por capacidade. Nenhum texto completo,
// nenhum ID, nenhum valor financeiro. O adapter seguro só consome esses
// campos — nada mais sai da Uni Engine para o pipeline real.
export const GUIDANCE_CONTRACTS = Object.freeze({
  METADATA_ONLY: Object.freeze({
    allowedFields: ['hasData', 'intentBand', 'confidenceBand', 'riskBand', 'engineVersion'],
    effect: 'metadata',
  }),
  DIAGNOSTICS_ONLY: Object.freeze({
    allowedFields: ['diagnostics', 'blockerCodes', 'divergenceCount'],
    effect: 'metadata',
  }),
  QUESTION_GUIDANCE: Object.freeze({
    allowedFields: ['questionKey', 'fieldsStillMissing'],
    effect: 'guidance',
  }),
  CLARIFICATION_GUIDANCE: Object.freeze({
    allowedFields: ['clarificationKey', 'ambiguityType', 'optionsCount'],
    effect: 'guidance',
  }),
  RESPONSE_STYLE_GUIDANCE: Object.freeze({
    allowedFields: ['styleKey', 'toneBand'],
    effect: 'guidance',
  }),
  RESPONSE_LENGTH_GUIDANCE: Object.freeze({
    allowedFields: ['lengthBand'],
    effect: 'guidance',
  }),
  CATEGORY_SUGGESTION: Object.freeze({
    allowedFields: ['suggestedCategoryKeys'],
    effect: 'guidance',
  }),
  ACCOUNT_SUGGESTION: Object.freeze({
    allowedFields: ['suggestedAccountKeys'],
    effect: 'guidance',
  }),
  GOAL_SUGGESTION: Object.freeze({
    allowedFields: ['suggestedGoalTypes'],
    effect: 'guidance',
  }),
  PLANNING_SUGGESTION: Object.freeze({
    allowedFields: ['suggestedStepOrder'],
    effect: 'guidance',
  }),
  RISK_WARNING: Object.freeze({
    allowedFields: ['riskBand', 'warningCode', 'blockerCount'],
    effect: 'guidance',
  }),
  CONFIDENCE_DISCLOSURE: Object.freeze({
    allowedFields: ['confidenceBand'],
    effect: 'metadata',
  }),
  MEMORY_READ_GUIDANCE: Object.freeze({
    allowedFields: ['relevantMemoryKeys', 'memoryCount'],
    effect: 'guidance',
  }),
  EPISTEMIC_CAUTION: Object.freeze({
    allowedFields: ['cautionCodes', 'conflictCount', 'staleCount'],
    effect: 'guidance',
  }),
  DECISION_RECOMMENDATION: Object.freeze({
    allowedFields: ['recommendedDecisionKey'],
    effect: 'guidance',
  }),
});

export function getGuidanceContract(capability) {
  return GUIDANCE_CONTRACTS[capability] ?? null;
}

export function isAllowedGuidanceField(capability, field) {
  const contract = getGuidanceContract(capability);
  if (!contract) return false;
  return contract.allowedFields.includes(field);
}

export function buildQuestionGuidance(options = {}) {
  const safe = options ?? {};
  return {
    questionKey: typeof safe.questionKey === 'string' ? safe.questionKey : null,
    fieldsStillMissing: Array.isArray(safe.fieldsStillMissing)
      ? safe.fieldsStillMissing.slice(0, 8)
      : [],
  };
}

export function buildRecommendationGuidance(options = {}) {
  const safe = options ?? {};
  return {
    recommendedDecisionKey: typeof safe.recommendedDecisionKey === 'string'
      ? safe.recommendedDecisionKey
      : null,
  };
}
