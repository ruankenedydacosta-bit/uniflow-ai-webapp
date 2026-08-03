import assert from 'node:assert/strict';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  adaptPlanningInput,
  createPlanningPlan,
  runPlanningAdapterShadow,
  UNI_OS_PLANNING_SCHEMA_VERSION,
} from './index.js';

const NOW = '2026-07-12T21:00:00.000Z';
const OPTIONS = Object.freeze({ now: () => NOW, idFactory: () => 'plan-001' });

function parsedIntent(overrides = {}) {
  return {
    intent: 'register_expense',
    confidence: 0.92,
    requiresConfirmation: true,
    entities: { accounts: [], categories: [], values: [80], dates: [] },
    ...overrides,
  };
}

test('financial_action gera plano completo sem executar', () => {
  const plan = adaptPlanningInput({ parsedIntent: parsedIntent() }, OPTIONS);
  assert.deepEqual(plan.steps.map((step) => step.type), [
    'identify_account', 'identify_category', 'identify_amount', 'identify_date',
    'ask_confirmation', 'persist_transaction',
  ]);
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.executionAllowed, false);
});

test('financial_action reutiliza somente conta explícita presente na memória', () => {
  const plan = adaptPlanningInput({
    parsedIntent: parsedIntent({
      entities: { accounts: [{ normalized: 'nubank' }], categories: [], values: [80], dates: [] },
    }),
    memorySnapshot: {
      financial: { accounts: [{ account: { normalized: 'nubank' } }] },
    },
  }, OPTIONS);
  assert.equal(plan.steps[0].type, 'reuse_account');
});

test('financial_question gera apenas plano consultivo', () => {
  const plan = adaptPlanningInput({
    parsedIntent: parsedIntent({ intent: 'check_balance', requiresConfirmation: false }),
  }, OPTIONS);
  assert.deepEqual(plan.steps.map((step) => step.type), ['respond_question', 'inform_user']);
  assert.equal(plan.requiresConfirmation, false);
});

test('casual gera somente representação de resposta', () => {
  const plan = adaptPlanningInput({ parsedIntent: parsedIntent({ intent: 'casual' }) }, OPTIONS);
  assert.deepEqual(plan.steps.map((step) => step.type), ['inform_user']);
});

test('planning gera plano consultivo', () => {
  const plan = adaptPlanningInput({ parsedIntent: parsedIntent({ intent: 'planning' }) }, OPTIONS);
  assert.deepEqual(plan.steps.map((step) => step.type), ['respond_question', 'inform_user']);
});

test('configuration exige confirmação sem aplicar mudança', () => {
  const plan = adaptPlanningInput({
    parsedIntent: parsedIntent({ intent: 'configuration', requiresConfirmation: false }),
  }, OPTIONS);
  assert.deepEqual(plan.steps.map((step) => step.type), ['ask_confirmation', 'inform_user']);
  assert.equal(plan.requiresConfirmation, true);
});

test('emergency gera orientação sem alarmismo nem execução', () => {
  const plan = adaptPlanningInput({
    parsedIntent: parsedIntent({ intent: 'question', attentionType: 'emergency' }),
  }, OPTIONS);
  assert.deepEqual(plan.steps.map((step) => step.type), ['inform_user']);
  assert.equal(plan.executionAllowed, false);
});

test('executionAllowed permanece false mesmo com entrada maliciosa', () => {
  const plan = createPlanningPlan({ executionAllowed: true, steps: [] });
  assert.equal(plan.executionAllowed, false);
});

test('schema preenche identidade, timestamp, confiança e versão', () => {
  const plan = adaptPlanningInput({ parsedIntent: parsedIntent() }, OPTIONS);
  assert.equal(plan.planId, 'plan-001');
  assert.equal(plan.timestamp, NOW);
  assert.equal(plan.intent, 'register_expense');
  assert.equal(plan.confidence, 0.92);
  assert.equal(plan.metadata.version, UNI_OS_PLANNING_SCHEMA_VERSION);
});

test('schema faz deep clone e deep freeze sem congelar entradas', () => {
  const steps = [{ type: 'inform_user', description: 'Orientar.', status: 'planned' }];
  const plan = createPlanningPlan({ steps });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.steps), true);
  assert.equal(Object.isFrozen(plan.steps[0]), true);
  assert.equal(Object.isFrozen(steps), false);
  assert.equal(Object.isFrozen(steps[0]), false);
});

test('parsedIntent, contexto e memória permanecem somente leitura', () => {
  const input = {
    parsedIntent: parsedIntent(),
    contextSnapshot: { workspace: { id: 'workspace-1' } },
    memorySnapshot: { financial: { accounts: [] } },
  };
  const original = structuredClone(input);
  adaptPlanningInput(input, OPTIONS);
  assert.deepEqual(input, original);
  assert.equal(Object.isFrozen(input.contextSnapshot), false);
  assert.equal(Object.isFrozen(input.memorySnapshot), false);
});

test('feature flag compartilhada permanece desligada', async () => {
  let observed = false;
  const result = await runPlanningAdapterShadow({}, { observer: () => { observed = true; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(observed, false);
});

test('modo sombra observa o plano e descarta o resultado', async () => {
  let observedPlan = null;
  const result = await runPlanningAdapterShadow({ parsedIntent: parsedIntent() }, {
    enabled: true,
    adapterOptions: OPTIONS,
    observer: async (plan) => { observedPlan = plan; },
  });
  assert.equal(observedPlan.planId, 'plan-001');
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.plan, null);
});

test('objetos vazios geram plano seguro e sem execução', () => {
  const plan = adaptPlanningInput({}, OPTIONS);
  assert.equal(plan.intent, 'question');
  assert.equal(plan.confidence, 0);
  assert.equal(plan.executionAllowed, false);
  assert.deepEqual(plan.steps.map((step) => step.type), ['respond_question', 'inform_user']);
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runPlanningAdapterShadow({}, {
    enabled: true,
    observer: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.plan, null);
});

test('logs DEV mostram somente tipos de passos e nunca descrições financeiras', async () => {
  const logs = [];
  await runPlanningAdapterShadow({ parsedIntent: parsedIntent() }, {
    enabled: true,
    isDevelopment: true,
    adapterOptions: OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Planning/);
  assert.doesNotMatch(serialized, /80|description|nubank|mercado/i);
});
