import { GOAL_PRIORITIES, GOAL_STATUSES, GOAL_TYPES } from './goalSchema.js';

const TYPE_ALIASES = Object.freeze({
  savings: 'Savings',
  saving: 'Savings',
  reserva: 'Savings',
  investment: 'Investment',
  investimento: 'Investment',
  emergencyfund: 'EmergencyFund',
  emergency_fund: 'EmergencyFund',
  reservaemergencia: 'EmergencyFund',
  debtreduction: 'DebtReduction',
  debt_reduction: 'DebtReduction',
  quitardivida: 'DebtReduction',
  incomegrowth: 'IncomeGrowth',
  income_growth: 'IncomeGrowth',
  aumentarrenda: 'IncomeGrowth',
  businessgrowth: 'BusinessGrowth',
  business_growth: 'BusinessGrowth',
  crescimentonegocio: 'BusinessGrowth',
  custom: 'Custom',
});

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '');
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeProgress(value) {
  const numeric = normalizeNumber(value);
  if (numeric === null) return 0;
  return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
}

function normalizeConfidence(value) {
  const numeric = normalizeNumber(value);
  return numeric === null ? 0 : clamp(numeric, 0, 1);
}

function normalizeDeadline(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function unwrapGoal(value) {
  if (!value || typeof value !== 'object') return {};
  return value.goal && typeof value.goal === 'object'
    ? { ...value, ...value.goal }
    : value;
}

export function normalizeGoalType(value) {
  if (GOAL_TYPES.includes(value)) return value;
  return TYPE_ALIASES[normalizeText(value)] ?? 'Custom';
}

export function normalizeGoalStatus(value) {
  const normalized = String(value ?? 'ACTIVE').trim().toUpperCase();
  return GOAL_STATUSES.includes(normalized) ? normalized : 'ACTIVE';
}

export function normalizeGoalPriority(value) {
  const normalized = String(value ?? 'NORMAL').trim().toUpperCase();
  return GOAL_PRIORITIES.includes(normalized) ? normalized : 'NORMAL';
}

export function normalizeGoal(value) {
  const source = unwrapGoal(value);
  const title = source.title ?? source.name ?? source.display ?? '';

  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : null,
    type: normalizeGoalType(source.type ?? source.goalType ?? source.category),
    title: typeof title === 'string' ? title.trim() : '',
    priority: normalizeGoalPriority(source.priority),
    progress: normalizeProgress(source.progress),
    status: normalizeGoalStatus(source.status),
    targetValue: normalizeNumber(source.targetValue ?? source.target_value ?? source.target),
    currentValue: normalizeNumber(source.currentValue ?? source.current_value ?? source.current),
    deadline: normalizeDeadline(source.deadline),
    confidence: normalizeConfidence(source.confidence),
  };
}

export function extractGoals(memorySnapshot = {}) {
  const source = memorySnapshot && typeof memorySnapshot === 'object' ? memorySnapshot : {};
  const candidates = source.financial?.goals ?? source.goals ?? [];
  return Array.isArray(candidates) ? candidates : [];
}
