// Estimativa de horizonte do objetivo (Fase 7 — Goal Engine, Shadow-only).
//
// O horizonte só é estimado com evidência: prazo numérico/explícito no alvo
// ou natureza contínua do tipo (orçamento, fluxo de caixa, organização).
// Nunca inventa prazo — sem evidência o resultado é UNKNOWN.
import { GOAL_POLICY } from './goalPolicy.js';

const OPEN_ENDED_TYPES = Object.freeze([
  'BUDGET',
  'CASH_FLOW',
  'FINANCIAL_ORGANIZATION',
  'INCOME',
  'EXPENSE_REDUCTION',
]);

function bandByMonths(months) {
  if (months <= 1) return 'IMMEDIATE';
  if (months <= GOAL_POLICY.horizonMonthsShort) return 'SHORT_TERM';
  if (months <= GOAL_POLICY.horizonMonthsMedium) return 'MEDIUM_TERM';
  return 'LONG_TERM';
}

function monthsUntil(date, referenceDate) {
  const target = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return null;
  const reference = referenceDate
    ? new Date(`${referenceDate}T00:00:00.000Z`)
    : new Date();
  if (Number.isNaN(reference.getTime())) return null;
  return Math.max(0, Math.round((target - reference) / (1000 * 60 * 60 * 24 * 30.44)));
}

export function estimateGoalHorizon(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const target = safe.target ?? {};
  const goalIntent = safe.goalIntent ?? {};

  if (!goalIntent.detected) return 'UNKNOWN';

  if (typeof target.horizonMonths === 'number' && target.horizonMonths > 0) {
    return bandByMonths(target.horizonMonths);
  }

  if (typeof target.date === 'string' && target.date) {
    const months = monthsUntil(target.date, safe.referenceDate);
    if (months == null) return 'UNKNOWN';
    return bandByMonths(months);
  }

  const matchedTypes = Array.isArray(goalIntent.matchedTypes) ? goalIntent.matchedTypes : [];
  if (matchedTypes.some((type) => OPEN_ENDED_TYPES.includes(type))) return 'OPEN_ENDED';

  return 'UNKNOWN';
}
