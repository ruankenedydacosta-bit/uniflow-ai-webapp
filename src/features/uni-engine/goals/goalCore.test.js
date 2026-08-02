// Testes das capacidades individuais do Goal Engine (Fase 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUserMessage } from '../normalizeUserMessage.js';
import { detectGoalIntent } from './detectGoalIntent.js';
import { classifyGoalType } from './classifyGoalType.js';
import { extractGoalCandidate } from './extractGoalCandidate.js';
import { extractGoalTarget } from './extractGoalTarget.js';
import { estimateGoalHorizon } from './estimateGoalHorizon.js';
import { evaluateGoalCompleteness } from './evaluateGoalCompleteness.js';
import { evaluateGoalDependencies } from './evaluateGoalDependencies.js';
import { evaluateGoalFeasibility } from './evaluateGoalFeasibility.js';
import { estimateGoalProgress } from './estimateGoalProgress.js';
import { computeGoalConfidence } from './computeGoalConfidence.js';
import { computeGoalPriority } from './computeGoalPriority.js';
import { detectGoalConflict } from './detectGoalConflict.js';
import { detectGoalRisk } from './detectGoalRisk.js';
import { buildGoalDiagnostics } from './buildGoalDiagnostics.js';
import { buildGoalSuggestions } from './buildGoalSuggestions.js';
import { goalStatus } from './runGoalEngine.js';

const REFERENCE_DATE = '2026-07-30';

function intent(text) {
  return detectGoalIntent({ normalizedMessage: normalizeUserMessage(text) });
}

// ---------------------------------------------------------------
// Detecção de objetivos explícitos e implícitos
// ---------------------------------------------------------------
test('detecção: objetivo explícito é reconhecido com tipo dominante', () => {
  const result = intent('Quero juntar R$ 10.000 em 12 meses');
  assert.equal(result.detected, true);
  assert.equal(result.explicit, true);
  assert.equal(result.implicit, false);
  assert.equal(result.ambiguous, false);
  assert.equal(result.dominantType, 'SAVINGS');
  assert.deepEqual(result.matchedKeywords, ['juntar']);
});

test('detecção: objetivo implícito é reconhecido sem verbo explícito', () => {
  const result = intent('guardar dinheiro todo mês');
  assert.equal(result.detected, true);
  assert.equal(result.explicit, false);
  assert.equal(result.implicit, true);
  assert.equal(result.source[0], 'implicit_inference');
});

test('detecção: keyword específica vence substring genérica de outro tipo', () => {
  const result = intent('preciso de uma reserva de emergência');
  assert.equal(result.detected, true);
  assert.equal(result.dominantType, 'EMERGENCY_FUND');
  assert.deepEqual(result.matchedTypes, ['EMERGENCY_FUND']);
  assert.equal(result.ambiguous, false);
});

test('detecção: meta explícita sem keyword financeira exige sinal de valor', () => {
  const withValue = intent('minha meta é ter 100 mil guardados');
  assert.equal(withValue.detected, true);
  assert.equal(withValue.explicit, true);
  assert.equal(withValue.dominantType, null);
  const withoutValue = intent('quero café');
  assert.equal(withoutValue.detected, false);
});

test('detecção: entradas vazia, inválida e não-objetivo não são objetivos', () => {
  assert.equal(detectGoalIntent().detected, false);
  assert.equal(detectGoalIntent(null).detected, false);
  assert.equal(detectGoalIntent('texto').detected, false);
  assert.equal(intent('   ').detected, false);
  assert.equal(intent('Olá, tudo bem?').detected, false);
  assert.equal(intent('qual é a capital do brasil?').detected, false);
  assert.equal(intent('Recebi 100 reais pelo Nubank').detected, false, 'registro de renda não é objetivo');
});

test('detecção: acentos no texto do usuário não quebram keywords acentuadas', () => {
  const result = intent('quero um pé de meia para emergências');
  assert.ok(result.detected);
});

test('detecção: múltiplos tipos tornam a detecção ambígua', () => {
  const result = intent('quero economizar e investir');
  assert.equal(result.detected, true);
  assert.equal(result.ambiguous, true);
  assert.ok(result.matchedTypes.length > 1);
});

// ---------------------------------------------------------------
// Extração e normalização do objetivo
// ---------------------------------------------------------------
test('extração: valor, prazo e descrição saem somente de evidência explícita', () => {
  const target = extractGoalTarget({
    normalizedMessage: normalizeUserMessage('Quero juntar R$ 10.000 em 12 meses'),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(target.amount, 10000);
  assert.equal(target.currency, 'BRL');
  assert.equal(target.date, null);
  assert.equal(target.horizonMonths, 12);
});

test('extração: valor escrito em reais e horizonte em anos', () => {
  const target = extractGoalTarget({
    normalizedMessage: normalizeUserMessage('quero investir 20 mil em 3 anos'),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(target.amount, 20000);
  assert.equal(target.horizonMonths, 36);
});

test('extração: data explícita vira data-alvo', () => {
  const target = extractGoalTarget({
    normalizedMessage: normalizeUserMessage('quero juntar 30 mil até 31/12/2027'),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(target.amount, 30000);
  assert.equal(target.date, '2027-12-31');
});

test('extração: ausência nunca vira zero', () => {
  const target = extractGoalTarget({
    normalizedMessage: normalizeUserMessage('quero poupar dinheiro'),
    referenceDate: REFERENCE_DATE,
  });
  assert.deepEqual(target, { amount: null, currency: null, date: null, horizonMonths: null, description: null });
});

test('extração: data relativa de transação não é aceita como prazo', () => {
  const target = extractGoalTarget({
    normalizedMessage: normalizeUserMessage('quero comprar um carro hoje'),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(target.date, null);
});

// ---------------------------------------------------------------
// Classificação do tipo
// ---------------------------------------------------------------
test('classificação: usa o tipo dominante da detecção', () => {
  const goalIntent = intent('quero juntar 10 mil');
  const candidate = extractGoalCandidate({ goalIntent, normalizedMessage: normalizeUserMessage('quero juntar 10 mil') });
  assert.equal(classifyGoalType({ goalIntent, candidate }), 'SAVINGS');
});

test('classificação: sem detecção retorna UNKNOWN', () => {
  const goalIntent = intent('Olá');
  const candidate = extractGoalCandidate({ goalIntent, normalizedMessage: normalizeUserMessage('Olá') });
  assert.equal(classifyGoalType({ goalIntent, candidate }), 'UNKNOWN');
});

test('classificação: workspace empresarial preserva tipos de negócio', () => {
  const goalIntent = intent('quero organizar o fluxo de caixa da minha empresa');
  const candidate = extractGoalCandidate({ goalIntent, normalizedMessage: normalizeUserMessage('quero organizar o fluxo de caixa da minha empresa') });
  assert.equal(classifyGoalType({ goalIntent, candidate, workspaceType: 'business' }), 'CASH_FLOW');
});

// ---------------------------------------------------------------
// Horizonte
// ---------------------------------------------------------------
test('horizonte: bandas a partir do prazo explícito', () => {
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true }, target: { horizonMonths: 1 }, referenceDate: REFERENCE_DATE }), 'IMMEDIATE');
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true }, target: { horizonMonths: 6 }, referenceDate: REFERENCE_DATE }), 'SHORT_TERM');
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true }, target: { horizonMonths: 12 }, referenceDate: REFERENCE_DATE }), 'MEDIUM_TERM');
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true }, target: { horizonMonths: 36 }, referenceDate: REFERENCE_DATE }), 'LONG_TERM');
});

test('horizonte: data-alvo é convertida em banda', () => {
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true }, target: { date: '2027-12-31' }, referenceDate: REFERENCE_DATE }), 'MEDIUM_TERM');
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true }, target: { date: '2030-01-01' }, referenceDate: REFERENCE_DATE }), 'LONG_TERM');
});

test('horizonte: tipos contínuos são OPEN_ENDED; sem evidência é UNKNOWN', () => {
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true, matchedTypes: ['BUDGET'] } }), 'OPEN_ENDED');
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true, matchedTypes: ['CASH_FLOW'] } }), 'OPEN_ENDED');
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true, matchedTypes: ['FINANCIAL_ORGANIZATION'] } }), 'OPEN_ENDED');
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: true, matchedTypes: ['SAVINGS'] } }), 'UNKNOWN', 'prazo nunca é inventado');
  assert.equal(estimateGoalHorizon({ goalIntent: { detected: false } }), 'UNKNOWN');
});

// ---------------------------------------------------------------
// Completude
// ---------------------------------------------------------------
test('completude: campos ausentes são identificados sem virar zero', () => {
  const completeness = evaluateGoalCompleteness({
    goal: {},
    target: { amount: null, currency: null, date: null, horizonMonths: null },
    financialSnapshot: { hasData: false, accounts: [] },
    persistentMemory: { retrieved: [] },
    operationalMemory: null,
    workspaceType: 'personal',
  });
  assert.ok(completeness.missing.includes('target_amount'));
  assert.ok(completeness.missing.includes('target_date'));
  assert.ok(completeness.missing.includes('horizon'));
  assert.ok(completeness.missing.includes('financial_snapshot'));
  assert.equal(completeness.isComplete, false);
});

test('completude: objetivo completo com snapshot e memória', () => {
  const completeness = evaluateGoalCompleteness({
    goal: {},
    target: { amount: 10000, currency: 'BRL', date: '2027-12-31', horizonMonths: 12 },
    financialSnapshot: { hasData: true, accounts: [{ id: 'a1' }] },
    persistentMemory: { retrieved: [{ id: 'm1' }] },
    operationalMemory: null,
    workspaceType: 'personal',
  });
  assert.equal(completeness.isComplete, true);
  assert.ok(completeness.available.includes('target_amount'));
  assert.ok(completeness.available.includes('financial_snapshot'));
  assert.ok(completeness.available.includes('memory'));
});

// ---------------------------------------------------------------
// Dependências
// ---------------------------------------------------------------
test('dependências: refletem exatamente os campos ausentes', () => {
  const completeness = {
    missing: ['target_amount', 'target_date', 'financial_snapshot', 'memory'],
  };
  const evaluation = evaluateGoalDependencies({
    goal: {},
    completeness,
    workspaceType: 'personal',
  });
  assert.equal(evaluation.totalCount, 4);
  assert.equal(evaluation.satisfiedCount, 0);
  assert.equal(evaluation.allSatisfied, false);
  assert.ok(evaluation.dependencies.every((entry) => entry.satisfied === false));
});

test('dependências: todas satisfeitas quando nada falta', () => {
  const evaluation = evaluateGoalDependencies({
    goal: {},
    completeness: { missing: [] },
    financialSnapshot: { hasData: true },
    workspaceType: 'personal',
  });
  assert.equal(evaluation.allSatisfied, true);
});

// ---------------------------------------------------------------
// Viabilidade
// ---------------------------------------------------------------
test('viabilidade: sem dados é INSUFFICIENT_DATA', () => {
  assert.equal(evaluateGoalFeasibility({
    completeness: { available: [], missing: ['target_amount'] },
    risks: [],
  }), 'INSUFFICIENT_DATA');
});

test('viabilidade: dados completos sem riscos é FEASIBLE', () => {
  assert.equal(evaluateGoalFeasibility({
    completeness: { available: ['target_amount', 'target_date', 'financial_snapshot', 'memory'] },
    risks: [],
    depAllSatisfied: true,
  }), 'FEASIBLE');
});

test('viabilidade: risco NONE não é tratado como risco real', () => {
  assert.equal(evaluateGoalFeasibility({
    completeness: { available: ['financial_snapshot', 'memory'] },
    risks: [{ type: 'NONE' }],
    depAllSatisfied: false,
  }), 'PARTIALLY_FEASIBLE');
});

// ---------------------------------------------------------------
// Confiança
// ---------------------------------------------------------------
test('confiança: explicitude e evidência aumentam; ausências diminuem', () => {
  const base = { type: 'SAVINGS', goalIntent: { detected: true, explicit: true, implicit: false, ambiguous: false, matchedTypeCount: 1 }, completeness: { available: ['target_amount', 'target_date', 'financial_snapshot', 'memory'], missing: [] }, workspaceType: 'personal' };
  const full = computeGoalConfidence(base);
  assert.equal(full, 1, 'evidência completa satura em 1');
  const sparse = computeGoalConfidence({ ...base, goalIntent: { ...base.goalIntent, explicit: false, implicit: true }, completeness: { available: [], missing: ['target_amount', 'target_date'] } });
  assert.ok(sparse < 0.5);
});

test('confiança: tipo desconhecido e conflitos penalizam', () => {
  const base = { goalIntent: { detected: true, explicit: true, matchedTypeCount: 1 }, completeness: { available: [], missing: [] }, workspaceType: 'personal' };
  const withType = computeGoalConfidence({ ...base, type: 'SAVINGS' });
  const unknownType = computeGoalConfidence({ ...base, type: 'UNKNOWN' });
  assert.ok(unknownType < withType);
  const withConflicts = computeGoalConfidence({ ...base, type: 'SAVINGS', conflictsCount: 1 });
  assert.ok(withConflicts < withType);
});

// ---------------------------------------------------------------
// Prioridade
// ---------------------------------------------------------------
test('prioridade: sem detecção é UNDETERMINED', () => {
  assert.equal(computeGoalPriority({ goalIntent: { detected: false } }), 'UNDETERMINED');
});

test('prioridade: sem informação suficiente também é UNDETERMINED', () => {
  const result = computeGoalPriority({
    goalIntent: { detected: true, explicit: false },
    completeness: { available: [], missing: [] },
    risks: [],
    workspaceType: 'personal',
    goal: { horizon: 'UNKNOWN' },
    type: 'SAVINGS',
  });
  assert.equal(result, 'UNDETERMINED');
});

test('prioridade: objetivo explícito e completo é CRITICAL', () => {
  const result = computeGoalPriority({
    goalIntent: { detected: true, explicit: true },
    completeness: { available: ['target_amount', 'target_date', 'horizon', 'financial_snapshot', 'memory'], missing: [] },
    risks: [{ type: 'NONE' }],
    conflictsCount: 0,
    depAllSatisfied: true,
    workspaceType: 'personal',
    goal: { horizon: 'SHORT_TERM' },
    type: 'SAVINGS',
  });
  assert.equal(result, 'CRITICAL');
});

test('prioridade: tipo desconhecido nunca é CRITICAL', () => {
  const result = computeGoalPriority({
    goalIntent: { detected: true, explicit: true },
    completeness: { available: ['target_amount', 'target_date', 'horizon', 'financial_snapshot', 'memory'], missing: [] },
    risks: [{ type: 'NONE' }],
    conflictsCount: 0,
    depAllSatisfied: true,
    workspaceType: 'personal',
    goal: { horizon: 'SHORT_TERM' },
    type: 'UNKNOWN',
  });
  assert.equal(result, 'HIGH');
});

test('prioridade: conflitos e riscos rebaixam', () => {
  const clean = computeGoalPriority({
    goalIntent: { detected: true, explicit: true },
    completeness: { available: ['target_amount', 'financial_snapshot'], missing: [] },
    risks: [],
    conflictsCount: 0,
    depAllSatisfied: true,
    workspaceType: 'personal',
    goal: { horizon: 'UNKNOWN' },
    type: 'SAVINGS',
  });
  const conflicted = computeGoalPriority({
    goalIntent: { detected: true, explicit: true },
    completeness: { available: ['target_amount', 'financial_snapshot'], missing: [] },
    risks: [{ type: 'CONFLICTING_GOALS' }, { type: 'DEPENDENCY_CASCADE' }],
    conflictsCount: 1,
    depAllSatisfied: false,
    workspaceType: 'personal',
    goal: { horizon: 'UNKNOWN' },
    type: 'SAVINGS',
  });
  const PRIORITY_BANDS = ['UNDETERMINED', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  assert.ok(
    PRIORITY_BANDS.indexOf(conflicted) < PRIORITY_BANDS.indexOf(clean),
    `conflitos e riscos rebaixam (${clean} → ${conflicted})`,
  );
});

// ---------------------------------------------------------------
// Conflitos
// ---------------------------------------------------------------
test('conflitos: múltiplos tipos de desembolso geram RESOURCE_CONFLICT', () => {
  const conflicts = detectGoalConflict({
    goalIntent: { detected: true, matchedTypes: ['SAVINGS', 'INVESTMENT'] },
    workspaceType: 'personal',
  });
  assert.ok(conflicts.some((c) => c.type === 'RESOURCE_CONFLICT'));
});

test('conflitos: acumulação compatível não gera conflito', () => {
  const conflicts = detectGoalConflict({
    goalIntent: { detected: true, matchedTypes: ['SAVINGS', 'EMERGENCY_FUND'] },
    workspaceType: 'personal',
  });
  assert.equal(conflicts.length, 0);
});

test('conflitos: pessoal e empresarial nunca se misturam', () => {
  const conflicts = detectGoalConflict({
    goalIntent: { detected: true, matchedTypes: ['SAVINGS', 'BUSINESS'] },
    workspaceType: 'personal',
  });
  assert.ok(conflicts.some((c) => c.type === 'PERSONAL_VS_BUSINESS'));
  const businessOnly = detectGoalConflict({
    goalIntent: { detected: true, matchedTypes: ['BUSINESS', 'CASH_FLOW', 'FINANCIAL_ORGANIZATION'] },
    workspaceType: 'business',
  });
  assert.equal(businessOnly.length, 0, 'tipos de negócio sozinhos não conflitam');
});

test('conflitos: sem detecção não há conflito', () => {
  assert.deepEqual(detectGoalConflict({ goalIntent: { detected: false } }), []);
});

// ---------------------------------------------------------------
// Riscos
// ---------------------------------------------------------------
test('riscos: dados insuficientes geram INSUFFICIENT_DATA', () => {
  const risks = detectGoalRisk({
    goalIntent: { detected: true },
    feasibility: 'INSUFFICIENT_DATA',
    completeness: { missing: [] },
    conflicts: [],
    goal: { type: 'SAVINGS' },
    financialSnapshot: {},
  });
  assert.ok(risks.some((r) => r.type === 'INSUFFICIENT_DATA'));
});

test('riscos: meta de desembolso único sem prazo pode ser UNREALISTIC_TARGET', () => {
  const risks = detectGoalRisk({
    goalIntent: { detected: true },
    feasibility: 'PARTIALLY_FEASIBLE',
    completeness: { missing: [] },
    conflicts: [],
    goal: { type: 'PURCHASE', target: { amount: 100000 } },
    financialSnapshot: { totalBalance: 1000 },
  });
  assert.ok(risks.some((r) => r.type === 'UNREALISTIC_TARGET'));
});

test('riscos: meta de acumulação nunca é julgada irrealista sem renda', () => {
  const risks = detectGoalRisk({
    goalIntent: { detected: true },
    feasibility: 'PARTIALLY_FEASIBLE',
    completeness: { missing: [] },
    conflicts: [],
    goal: { type: 'SAVINGS', target: { amount: 100000, horizonMonths: null } },
    financialSnapshot: { totalBalance: 1000 },
  });
  assert.ok(!risks.some((r) => r.type === 'UNREALISTIC_TARGET'));
});

test('riscos: com prazo a meta não é declarada irrealista', () => {
  const risks = detectGoalRisk({
    goalIntent: { detected: true },
    feasibility: 'PARTIALLY_FEASIBLE',
    completeness: { missing: [] },
    conflicts: [],
    goal: { type: 'PURCHASE', target: { amount: 100000, horizonMonths: 12 } },
    financialSnapshot: { totalBalance: 1000 },
  });
  assert.ok(!risks.some((r) => r.type === 'UNREALISTIC_TARGET'));
});

test('riscos: sem risco crítico retorna NONE; sem detecção retorna vazio', () => {
  assert.deepEqual(detectGoalRisk({ goalIntent: { detected: false } }), []);
  const none = detectGoalRisk({
    goalIntent: { detected: true },
    feasibility: 'FEASIBLE',
    completeness: { missing: [] },
    conflicts: [],
    goal: { type: 'SAVINGS' },
    financialSnapshot: { totalBalance: 1000 },
  });
  assert.deepEqual(none, [{ type: 'NONE', description: 'Nenhum risco crítico detectado.' }]);
});

// ---------------------------------------------------------------
// Progresso
// ---------------------------------------------------------------
test('progresso: exige alvo, snapshot E memória — sem evidência é null', () => {
  const goalIntent = { detected: true };
  const goal = { target: { amount: 10000 } };
  assert.equal(estimateGoalProgress({ goalIntent, goal, financialSnapshot: {}, completeness: { available: [] } }), null);
  assert.equal(estimateGoalProgress({ goalIntent, goal: { target: {} }, financialSnapshot: { totalBalance: 500 }, completeness: { available: ['financial_snapshot'] } }), null);
  assert.equal(estimateGoalProgress({ goalIntent, goal, financialSnapshot: { totalBalance: 500 }, completeness: { available: ['financial_snapshot'] } }), null, 'saldo sem memória não vira progresso');
});

test('progresso: com evidência suficiente estima proporcionalmente', () => {
  const goalIntent = { detected: true };
  const result = estimateGoalProgress({
    goalIntent,
    goal: { target: { amount: 10000 } },
    financialSnapshot: { totalBalance: 740.5 },
    completeness: { available: ['financial_snapshot', 'memory'] },
  });
  assert.equal(result, 7);
});

test('progresso: saldo ausente/zero não é progresso', () => {
  const goalIntent = { detected: true };
  const result = estimateGoalProgress({
    goalIntent,
    goal: { target: { amount: 10000 } },
    financialSnapshot: { totalBalance: 0 },
    completeness: { available: ['financial_snapshot', 'memory'] },
  });
  assert.equal(result, null);
});

// ---------------------------------------------------------------
// Diagnósticos estruturados
// ---------------------------------------------------------------
test('diagnósticos: objetivo detectado gera o conjunto completo', () => {
  const { diagnostics } = buildGoalDiagnostics({
    goalIntent: { detected: true, explicit: true, implicit: false, ambiguous: false, matchedTypeCount: 1, matchedKeywords: ['juntar'] },
    type: 'SAVINGS',
    completeness: { isComplete: true, available: ['target_amount'], missing: [] },
    conflicts: [],
    risks: [{ type: 'NONE' }],
    dependencyEvaluation: { allSatisfied: true },
    progress: 10,
    recommendedNextStep: 'MONITOR_PROGRESS',
    workspaceType: 'personal',
    status: 'ACTIVE_SHADOW',
  });
  assert.ok(diagnostics.includes('GOAL_DETECTED'));
  assert.ok(diagnostics.includes('GOAL_EXPLICIT'));
  assert.ok(diagnostics.includes('GOAL_TYPE_IDENTIFIED'));
  assert.ok(diagnostics.includes('TARGET_AMOUNT_AVAILABLE'));
  assert.ok(diagnostics.includes('NO_CONFLICTS_DETECTED'));
  assert.ok(diagnostics.includes('SHADOW_ONLY'));
  assert.ok(diagnostics.includes('PERSONAL_WORKSPACE'));
  assert.ok(diagnostics.includes('PROGRESS_ESTIMATED'));
});

test('diagnósticos: sem detecção sinaliza GOAL_NOT_DETECTED e SHADOW_ONLY', () => {
  const { diagnostics } = buildGoalDiagnostics({
    goalIntent: { detected: false },
    type: 'UNKNOWN',
    completeness: { available: [], missing: [] },
    conflicts: [],
    risks: [],
    dependencyEvaluation: { allSatisfied: false },
    progress: null,
    recommendedNextStep: 'NO_ACTION',
    workspaceType: 'business',
    status: 'UNKNOWN',
  });
  assert.ok(diagnostics.includes('GOAL_NOT_DETECTED'));
  assert.ok(diagnostics.includes('SHADOW_ONLY'));
  assert.ok(diagnostics.includes('BUSINESS_WORKSPACE'));
});

// ---------------------------------------------------------------
// Sugestões e próximo passo
// ---------------------------------------------------------------
test('sugestões: pedem exatamente o que falta e nunca executam', () => {
  const { suggestions, recommendedNextStep } = buildGoalSuggestions({
    goalIntent: { detected: true, ambiguous: false },
    type: 'SAVINGS',
    completeness: { isComplete: false, available: [], missing: ['target_amount', 'target_date', 'horizon'] },
    conflicts: [],
    risks: [],
    workspaceType: 'personal',
  });
  assert.ok(suggestions.includes('ASK_TARGET_AMOUNT'));
  assert.ok(suggestions.includes('ASK_TARGET_DATE'));
  assert.ok(suggestions.includes('ASK_HORIZON'));
  assert.equal(recommendedNextStep, 'REQUEST_TARGET_DETAILS');
  assert.ok(!suggestions.some((s) => s.includes('EXECUTE')), 'nenhuma sugestão executa');
});

test('sugestões: investimento com dados insuficientes só pergunta preferência', () => {
  const { suggestions } = buildGoalSuggestions({
    goalIntent: { detected: true },
    type: 'INVESTMENT',
    completeness: { isComplete: false, available: [], missing: ['target_amount'] },
    conflicts: [],
    risks: [{ type: 'INSUFFICIENT_DATA' }],
    workspaceType: 'personal',
  });
  assert.ok(suggestions.includes('ASK_INVESTMENT_PREFERENCE'));
});

test('sugestões: conflito pessoal×empresarial recomenda separação', () => {
  const { suggestions } = buildGoalSuggestions({
    goalIntent: { detected: true },
    type: 'SAVINGS',
    completeness: { isComplete: true, available: [], missing: [] },
    conflicts: [{ type: 'PERSONAL_VS_BUSINESS' }],
    risks: [],
    workspaceType: 'personal',
  });
  assert.ok(suggestions.includes('SEPARATE_PERSONAL_BUSINESS'));
});

test('sugestões: sem objetivo é NO_ACTION', () => {
  assert.deepEqual(buildGoalSuggestions({ goalIntent: { detected: false } }), {
    suggestions: ['NO_ACTION'],
    recommendedNextStep: 'NO_ACTION',
  });
});

// ---------------------------------------------------------------
// Status
// ---------------------------------------------------------------
test('status: mapeamento determinístico com evidência', () => {
  assert.equal(goalStatus({ detected: false }), 'UNKNOWN');
  assert.equal(goalStatus({ detected: true, feasibility: 'CURRENTLY_INFEASIBLE', completeness: {}, conflicts: [], risks: [], progress: null, confidence: 0 }), 'BLOCKED');
  assert.equal(goalStatus({ detected: true, feasibility: 'FEASIBLE', completeness: {}, conflicts: [{ type: 'RESOURCE_CONFLICT' }], risks: [], progress: null, confidence: 0 }), 'BLOCKED');
  assert.equal(goalStatus({ detected: true, feasibility: 'PARTIALLY_FEASIBLE', completeness: { isComplete: true }, conflicts: [], risks: [{ type: 'UNREALISTIC_TARGET' }], progress: null, confidence: 0 }), 'AT_RISK');
  assert.equal(goalStatus({ detected: true, feasibility: 'PARTIALLY_FEASIBLE', completeness: { isComplete: true }, conflicts: [], risks: [], progress: 100, confidence: 0.9 }), 'ACHIEVED_INFERRED', 'só com progresso 100 estimado por evidência');
  assert.equal(goalStatus({ detected: true, feasibility: 'PARTIALLY_FEASIBLE', completeness: { isComplete: false, missing: [1, 2, 3] }, conflicts: [], risks: [], progress: null, confidence: 0.5 }), 'DRAFT');
  assert.equal(goalStatus({ detected: true, feasibility: 'PARTIALLY_FEASIBLE', completeness: { isComplete: true, missing: ['target_date'] }, conflicts: [], risks: [], progress: null, confidence: 0.5 }), 'NEEDS_INFORMATION');
  assert.equal(goalStatus({ detected: true, feasibility: 'FEASIBLE', completeness: { isComplete: true, missing: [] }, conflicts: [], risks: [], progress: null, confidence: 0.8 }), 'ACTIVE_SHADOW');
  assert.equal(goalStatus({ detected: true, feasibility: 'FEASIBLE', completeness: { isComplete: true, missing: [] }, conflicts: [], risks: [], progress: null, confidence: 0.4 }), 'READY');
});
