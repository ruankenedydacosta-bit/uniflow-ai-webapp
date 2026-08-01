import { createPlanningGoal } from './planningContracts.js';
import { extractAmount } from '../../uni-intents/entityExtractor.js';

const SUBJECT_BY_TYPE = Object.freeze({
  FINANCIAL: 'financial_goal',
  SAVINGS: 'savings_goal',
  DEBT: 'debt_goal',
  INVESTMENT: 'investment_goal',
  BUDGET: 'budget_goal',
  BUSINESS: 'business_goal',
  GENERAL: 'general_goal',
  UNKNOWN: null,
});

function extractHorizonMonths(text) {
  const months = text.match(/\b(?:em|durante)\s+(\d{1,3})\s+mes(?:es)?\b/);
  if (months) return Math.max(1, Number(months[1]));
  const years = text.match(/\b(?:em|durante)\s+(\d{1,2})\s+ano(?:s)?\b/);
  if (years) return Math.max(1, Number(years[1]) * 12);
  return null;
}

export function extractPlanningGoal(input = {}) {
  const normalized = input.normalizedMessage ?? {};
  const intent = input.planningIntent ?? {};
  const text = String(normalized.searchableText ?? '');
  const textWithoutHorizon = String(normalized.trimmedText ?? '')
    .replace(/\b(?:em|durante)\s+\d{1,3}\s+mes(?:es)?\b/gi, '')
    .replace(/\b(?:em|durante)\s+\d{1,2}\s+ano(?:s)?\b/gi, '');
  const amount = Number(extractAmount(textWithoutHorizon));
  const targetDate = normalized.extractedHints?.date ?? null;
  const horizonMonths = extractHorizonMonths(text);
  const goalType = intent.primaryGoalType ?? 'UNKNOWN';
  return createPlanningGoal({
    detected: intent.detected,
    type: goalType,
    subject: SUBJECT_BY_TYPE[goalType] ?? null,
    targetAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
    currency: Number.isFinite(amount) && amount > 0 ? 'BRL' : null,
    targetDate,
    horizonMonths,
    multiple: intent.multiple,
    detectedGoalTypes: intent.detectedGoalTypes,
    sourceIntent: intent.sourceIntent,
    constraints: [],
  });
}

export { extractHorizonMonths };
