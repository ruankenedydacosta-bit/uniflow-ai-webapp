// Uni Engine — Fase 18: Elegibilidade do Runtime Financeiro.
export {
  FINANCIAL_RESPONSE_REJECTION_REASONS,
  FINANCIAL_RESPONSE_DECISIONS,
  isRejectionReason,
  isFinancialResponseDecision,
  createEmptyFinancialEligibilityResult,
  validateFinancialEligibilityInput,
  validateFinancialEligibilityResult,
} from './financialEligibilityContracts.js';

export {
  FINANCIAL_VISIBLE_INTENTS,
  FINANCIAL_BLOCKED_INTENTS,
  isIntentVisibleAllowed,
  isIntentBlockedForVisible,
  isWriteIntent,
  getVisibleIntents,
  getBlockedIntents,
  validateVisibleIntentsCoverage,
} from './visibleIntents.js';

export {
  evaluateFinancialEligibility,
  validateFinancialRuntimeSafety,
} from './evaluateFinancialEligibility.js';
