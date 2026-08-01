import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUserMessage } from '../normalizeUserMessage.js';
import { buildPlanningDiagnostics } from './buildPlanningDiagnostics.js';
import { buildPlanningSteps } from './buildPlanningSteps.js';
import { buildPlanningSuggestions } from './buildPlanningSuggestions.js';
import { buildPlanningTimeline } from './buildPlanningTimeline.js';
import { computePlanningConfidence } from './computePlanningConfidence.js';
import { detectPlanningIntent } from './detectPlanningIntent.js';
import { detectPlanningRisk } from './detectPlanningRisk.js';
import { estimatePlanningComplexity } from './estimatePlanningComplexity.js';
import { evaluatePlanningDependencies } from './evaluatePlanningDependencies.js';
import { extractPlanningGoal } from './extractPlanningGoal.js';

function detect(text, sourceIntent = null) {
  const normalizedMessage = normalizeUserMessage(text);
  const planningIntent = detectPlanningIntent({ normalizedMessage, classification: { primaryIntent: sourceIntent } });
  return { normalizedMessage, planningIntent, goal: extractPlanningGoal({ normalizedMessage, planningIntent }) };
}

const intentCases = [
  ['Quero juntar dez mil reais', 'SAVINGS'],
  ['Preciso economizar dinheiro', 'SAVINGS'],
  ['Quero guardar R$ 500', 'SAVINGS'],
  ['Quero montar uma reserva', 'SAVINGS'],
  ['Quero quitar minha dívida', 'DEBT'],
  ['Tenho dívidas para pagar', 'DEBT'],
  ['Quero investir 1000 reais', 'INVESTMENT'],
  ['Planejar meu investimento', 'INVESTMENT'],
  ['Quero criar um orçamento', 'BUDGET'],
  ['Preciso planejar gastos', 'BUDGET'],
  ['Quero melhorar o fluxo de caixa da empresa', 'BUSINESS'],
  ['Planejar capital de giro do negócio', 'BUSINESS'],
  ['Tenho uma meta financeira', 'FINANCIAL'],
  ['Quero um objetivo financeiro', 'FINANCIAL'],
  ['Quero planejar', 'GENERAL'],
  ['Tenho uma meta', 'GENERAL'],
  ['Olá, tudo bem?', 'UNKNOWN'],
];

for (const [text, expected] of intentCases) {
  test(`detecção: ${text}`, () => assert.equal(detect(text).planningIntent.primaryGoalType, expected));
}

test('detecção usa create_goal como fallback financeiro', () => {
  assert.equal(detect('Meta de 1000 reais', 'create_goal').planningIntent.primaryGoalType, 'FINANCIAL');
});

test('detecção identifica múltiplos objetivos', () => {
  assert.equal(detect('Quero economizar e investir').planningIntent.multiple, true);
});

const extractionCases = [
  ['Quero juntar R$ 10.000 em 12 meses', 10000, 12],
  ['Quero economizar 500 reais em 6 meses', 500, 6],
  ['Quero investir mil reais em 2 anos', 1000, 24],
  ['Quero quitar 120 reais', 120, null],
];

for (const [text, amount, months] of extractionCases) {
  test(`extração: ${text}`, () => {
    const { goal } = detect(text);
    assert.equal(goal.targetAmount, amount);
    assert.equal(goal.horizonMonths, months);
  });
}

const complexityCases = [
  ['GENERAL', 0, false, 'LOW'],
  ['SAVINGS', 0, false, 'LOW'],
  ['DEBT', 0, false, 'MEDIUM'],
  ['INVESTMENT', 0, false, 'MEDIUM'],
  ['BUSINESS', 2, false, 'HIGH'],
  ['INVESTMENT', 2, true, 'VERY_HIGH'],
  ['BUSINESS', 3, true, 'VERY_HIGH'],
];

for (const [type, missingCount, multiple, expected] of complexityCases) {
  test(`complexidade ${type}/${missingCount}/${multiple}`, () => {
    const dependencies = Array.from({ length: missingCount }, () => ({ required: true, satisfied: false }));
    assert.equal(estimatePlanningComplexity({ goal: { type, multiple }, dependencies }).complexity, expected);
  });
}

test('dependências de savings exigem alvo, prazo e snapshot', () => {
  const result = evaluatePlanningDependencies({ goal: { type: 'SAVINGS' } });
  assert.deepEqual(result.missing.map((entry) => entry.type), ['TARGET_AMOUNT', 'TARGET_DATE', 'FINANCIAL_SNAPSHOT']);
});

test('dependências business exigem workspace business', () => {
  const result = evaluatePlanningDependencies({ goal: { type: 'BUSINESS' }, financialSnapshot: { hasData: true }, userPreferences: { workspaceType: 'personal' } });
  assert.ok(result.missing.some((entry) => entry.type === 'WORKSPACE_CONTEXT'));
});

test('dependências investment exigem perfil', () => {
  const result = evaluatePlanningDependencies({ goal: { type: 'INVESTMENT', targetAmount: 100, horizonMonths: 12 }, financialSnapshot: { hasData: true } });
  assert.ok(result.missing.some((entry) => entry.type === 'INVESTMENT_PROFILE'));
});

test('timeline deriva meta sem inventar valor', () => {
  const timeline = buildPlanningTimeline({ goal: { type: 'SAVINGS', targetAmount: 1200, horizonMonths: 12 }, timestamp: '2026-08-01T00:00:00.000Z' });
  assert.equal(timeline.targetDate, '2027-08-01');
  assert.equal(timeline.milestones.at(-1).targetAmount, 1200);
});

test('timeline sem alvo mantém valores nulos', () => {
  const timeline = buildPlanningTimeline({ goal: { type: 'GENERAL' }, timestamp: '2026-08-01' });
  assert.ok(timeline.milestones.every((entry) => entry.targetAmount === null));
});

test('steps são ordenados e limitados', () => {
  const steps = buildPlanningSteps({ goal: { detected: true, type: 'SAVINGS', targetAmount: 100, horizonMonths: 6 }, dependencies: [] });
  assert.ok(steps.length <= 10);
  assert.deepEqual(steps.map((entry) => entry.order), steps.map((_, index) => index + 1));
});

test('steps incluem resolução quando dependência falta', () => {
  const steps = buildPlanningSteps({ goal: { detected: true, type: 'SAVINGS' }, dependencies: [{ type: 'TARGET_AMOUNT', required: true, satisfied: false }] });
  assert.ok(steps.some((entry) => entry.type === 'RESOLVE_DEPENDENCY'));
});

test('confiança aumenta com contexto completo', () => {
  const goal = { detected: true, type: 'SAVINGS', targetAmount: 1000, horizonMonths: 12 };
  const low = computePlanningConfidence({ goal, dependencyEvaluation: { missing: [{ type: 'X' }] } }).confidence;
  const high = computePlanningConfidence({ goal, financialSnapshot: { hasData: true }, dependencyEvaluation: { missing: [] } }).confidence;
  assert.ok(high > low);
});

test('risco epistêmico é alto', () => {
  const risk = detectPlanningRisk({ goal: { detected: true }, dependencyEvaluation: { missing: [] }, epistemicModel: { conflicts: [{}] }, complexity: 'LOW' });
  assert.equal(risk.level, 'HIGH');
});

test('diagnósticos e sugestões refletem dependências', () => {
  const dependencyEvaluation = { missing: [{ type: 'TARGET_AMOUNT', required: true, satisfied: false }] };
  const diagnostics = buildPlanningDiagnostics({ goal: { detected: true, type: 'SAVINGS' }, dependencyEvaluation, status: 'PARTIAL' });
  const suggestions = buildPlanningSuggestions({ goal: { detected: true }, dependencyEvaluation, status: 'PARTIAL' });
  assert.ok(diagnostics.includes('PLAN_PARTIAL'));
  assert.ok(suggestions.includes('ASK_TARGET_AMOUNT'));
});
