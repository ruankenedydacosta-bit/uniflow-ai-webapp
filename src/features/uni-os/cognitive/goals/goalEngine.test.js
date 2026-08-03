import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  GOAL_TYPES,
  createGoalEngineSnapshot,
  normalizeGoal,
  prioritizeGoals,
  processGoals,
  runGoalEngineShadow,
} from './index.js';

const REFERENCE_NOW = '2026-07-12T12:00:00.000Z';

function goal(overrides = {}) {
  return {
    id: 'goal-1',
    type: 'Savings',
    title: 'Reserva',
    priority: 'NORMAL',
    progress: 0.4,
    status: 'ACTIVE',
    targetValue: 10000,
    currentValue: 4000,
    deadline: '2026-12-31',
    confidence: 1,
    ...overrides,
  };
}

test('schema expõe contrato completo e catálogos oficiais', () => {
  const snapshot = createGoalEngineSnapshot({ goals: [goal()], primaryGoal: goal() });

  assert.deepEqual(GOAL_TYPES, [
    'Savings', 'Investment', 'EmergencyFund', 'DebtReduction',
    'IncomeGrowth', 'BusinessGrowth', 'Custom',
  ]);
  assert.deepEqual(GOAL_STATUSES, ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']);
  assert.deepEqual(GOAL_PRIORITIES, ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
  assert.equal(snapshot.goals.length, 1);
  assert.equal(snapshot.primaryGoal.id, 'goal-1');
});

test('normalizador padroniza tipo, progresso, valores e data sem inventar ID', () => {
  const normalized = normalizeGoal({
    type: 'reserva emergencia',
    name: 'Minha reserva',
    progress: 45,
    target_value: '20000',
    current_value: '9000',
    deadline: '2026-10-10',
    confidence: 2,
  });

  assert.equal(normalized.id, null);
  assert.equal(normalized.type, 'EmergencyFund');
  assert.equal(normalized.title, 'Minha reserva');
  assert.equal(normalized.progress, 0.45);
  assert.equal(normalized.targetValue, 20000);
  assert.equal(normalized.currentValue, 9000);
  assert.equal(normalized.confidence, 1);
});

test('schema limita progresso e confiança e rejeita data inválida', () => {
  const snapshot = createGoalEngineSnapshot({
    goals: [goal({ progress: 3, confidence: -1, deadline: '2026-02-31' })],
    primaryGoal: goal(),
  });

  assert.equal(snapshot.goals[0].progress, 1);
  assert.equal(snapshot.goals[0].confidence, 0);
  assert.equal(snapshot.goals[0].deadline, null);
});

test('prioridade explícita é preservada', () => {
  const [prioritized] = prioritizeGoals([goal({ priority: 'CRITICAL' })], { now: REFERENCE_NOW });
  assert.equal(prioritized.priority, 'CRITICAL');
});

test('prazo vencido eleva prioridade deterministicamente para CRITICAL', () => {
  const [prioritized] = prioritizeGoals([
    goal({ priority: 'LOW', deadline: '2026-07-01' }),
  ], { now: REFERENCE_NOW });
  assert.equal(prioritized.priority, 'CRITICAL');
});

test('fundo de emergência e redução de dívida recebem no mínimo HIGH', () => {
  const prioritized = prioritizeGoals([
    goal({ id: 'emergency', type: 'EmergencyFund', priority: 'LOW' }),
    goal({ id: 'debt', type: 'DebtReduction', priority: 'NORMAL' }),
  ], { now: REFERENCE_NOW });

  assert.equal(prioritized.every((item) => item.priority === 'HIGH'), true);
});

test('ordenação usa prioridade, prazo e ordem original como desempate', () => {
  const prioritized = prioritizeGoals([
    goal({ id: 'normal', priority: 'NORMAL', deadline: null }),
    goal({ id: 'high-later', priority: 'HIGH', deadline: '2026-12-20' }),
    goal({ id: 'high-sooner', priority: 'HIGH', deadline: '2026-12-01' }),
  ], { now: REFERENCE_NOW });

  assert.deepEqual(prioritized.map((item) => item.id), ['high-sooner', 'high-later', 'normal']);
});

test('objetivos vazios geram snapshot seguro', () => {
  const snapshot = processGoals();
  assert.deepEqual(snapshot.goals, []);
  assert.equal(snapshot.primaryGoal, null);
  assert.equal(snapshot.metadata.sourceGoalCount, 0);
});

test('múltiplos objetivos ativos são organizados e definem primaryGoal', () => {
  const snapshot = processGoals({
    memorySnapshot: {
      financial: {
        goals: [
          goal({ id: 'savings', priority: 'NORMAL' }),
          goal({ id: 'business', type: 'BusinessGrowth', priority: 'CRITICAL' }),
        ],
      },
    },
  }, { now: REFERENCE_NOW });

  assert.equal(snapshot.goals.length, 2);
  assert.equal(snapshot.primaryGoal.id, 'business');
  assert.equal(snapshot.metadata.sorted, true);
});

test('objetivos não ativos são ignorados sem serem apagados da fonte', () => {
  const goals = [
    goal({ id: 'active' }),
    goal({ id: 'paused', status: 'PAUSED' }),
    goal({ id: 'completed', status: 'COMPLETED' }),
    goal({ id: 'archived', status: 'ARCHIVED' }),
  ];
  const snapshot = processGoals({ memorySnapshot: { financial: { goals } } });

  assert.deepEqual(snapshot.goals.map((item) => item.id), ['active']);
  assert.equal(goals.length, 4);
  assert.equal(goals[1].status, 'PAUSED');
});

test('snapshot aplica deep freeze obrigatório', () => {
  const snapshot = processGoals({ memorySnapshot: { financial: { goals: [goal()] } } });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.goals), true);
  assert.equal(Object.isFrozen(snapshot.goals[0]), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
});

test('engine não altera memória, contexto ou intenção', () => {
  const memorySnapshot = { financial: { goals: [goal()] } };
  const contextSnapshot = { workspace: { role: 'owner' } };
  const parsedIntent = { intent: 'planning' };
  const before = JSON.stringify({ memorySnapshot, contextSnapshot, parsedIntent });

  processGoals({ memorySnapshot, contextSnapshot, parsedIntent }, { now: REFERENCE_NOW });

  assert.equal(JSON.stringify({ memorySnapshot, contextSnapshot, parsedIntent }), before);
  assert.equal(Object.isFrozen(memorySnapshot), false);
});

test('metadados bloqueiam criação, persistência e execução', () => {
  const snapshot = processGoals({ memorySnapshot: { financial: { goals: [goal()] } } });
  assert.equal(snapshot.metadata.generatedGoals, false);
  assert.equal(snapshot.metadata.persisted, false);
  assert.equal(snapshot.metadata.executionAllowed, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runGoalEngineShadow(), { status: 'DISABLED', goals: null });
});

test('modo sombra entrega snapshot ao observer e descarta resultado', async () => {
  let observed;
  const result = await runGoalEngineShadow(
    { memorySnapshot: { financial: { goals: [goal()] } } },
    { enabled: true, observer: (snapshot) => { observed = snapshot; } },
  );

  assert.equal(observed.goals.length, 1);
  assert.deepEqual(result, { status: 'OBSERVED', goals: null });
});

test('falha do observer é controlada sem expor snapshot', async () => {
  const result = await runGoalEngineShadow(
    { memorySnapshot: { financial: { goals: [goal()] } } },
    { enabled: true, observer: () => { throw new Error('observer failure'); } },
  );

  assert.deepEqual(result, { status: 'FAILED_SAFE', goals: null });
});

test('entradas inválidas resultam em snapshot vazio sem lançar erro', () => {
  const snapshot = processGoals({ memorySnapshot: { financial: { goals: 'invalid' } } });
  assert.deepEqual(snapshot.goals, []);
  assert.equal(snapshot.primaryGoal, null);
});

test('engine não chama API, Supabase ou serviços externos', async () => {
  const sources = await Promise.all([
    'goalEngine.js',
    'goalNormalizer.js',
    'goalPrioritizer.js',
    'goalSchema.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');

  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /supabase|openai|elevenlabs/i);
});
