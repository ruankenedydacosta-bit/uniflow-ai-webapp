import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanningPlan } from '../planning/index.js';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  adaptReflectionInput,
  createReflectionSnapshot,
  runReflectionAdapterShadow,
  UNI_OS_REFLECTION_SCHEMA_VERSION,
} from './index.js';

const NOW = '2026-07-12T22:00:00.000Z';
const OPTIONS = Object.freeze({ now: () => NOW, idFactory: () => 'reflection-001' });

function parsedIntent(overrides = {}) {
  return {
    intent: 'register_expense',
    confidence: 0.95,
    entities: {
      accounts: [{ normalized: 'nubank' }],
      categories: [{ normalized: 'alimentacao' }],
      values: [80],
      dates: ['2026-07-12'],
      workspaces: [],
    },
    requiresConfirmation: true,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return createPlanningPlan({
    planId: 'plan-001',
    timestamp: NOW,
    intent: 'register_expense',
    confidence: 0.95,
    requiresConfirmation: true,
    steps: [{ type: 'ask_confirmation', description: 'Confirmar.', status: 'planned' }],
    ...overrides,
  });
}

function reflect(overrides = {}) {
  return adaptReflectionInput({
    parsedIntent: parsedIntent(),
    contextSnapshot: { workspace: { id: 'workspace-1' } },
    memorySnapshot: { financial: { accounts: [] } },
    planningSnapshot: plan(),
    ...overrides,
  }, OPTIONS);
}

test('plano válido recebe risco baixo e recomenda confirmação', () => {
  const result = reflect();
  assert.equal(result.overallRisk, 'LOW');
  assert.equal(result.confirmationRequired, true);
  assert.deepEqual(result.recommendations, ['ASK_CONFIRMATION', 'PROCEED_AFTER_CONFIRMATION']);
  assert.equal(result.executionAllowed, false);
});

test('plano vazio é inconsistência de alto risco', () => {
  const result = reflect({ planningSnapshot: plan({ steps: [] }) });
  assert.equal(result.overallRisk, 'HIGH');
  assert.equal(result.inconsistencies[0].code, 'EMPTY_PLAN');
});

test('baixa confiança exige desambiguação sem executar', () => {
  const result = reflect({
    parsedIntent: parsedIntent({ confidence: 0.35 }),
    planningSnapshot: plan({ confidence: 0.35 }),
  });
  assert.equal(result.confidence, 0.35);
  assert.equal(result.overallRisk, 'MEDIUM');
  assert.ok(result.recommendations.includes('REQUEST_DISAMBIGUATION'));
});

test('alta confiança é preservada em plano consistente', () => {
  const result = reflect();
  assert.equal(result.confidence, 0.95);
  assert.equal(result.ambiguityDetected, false);
});

test('múltiplas contas e categorias geram ambiguidade', () => {
  const result = reflect({
    parsedIntent: parsedIntent({
      entities: {
        accounts: [{ normalized: 'nubank' }, { normalized: 'itau' }],
        categories: [{ normalized: 'mercado' }, { normalized: 'alimentacao' }],
        values: [80], dates: ['2026-07-12'], workspaces: [],
      },
    }),
  });
  assert.equal(result.ambiguityDetected, true);
  assert.equal(result.overallRisk, 'HIGH');
  assert.ok(result.recommendations.includes('REQUEST_DISAMBIGUATION'));
});

test('conflito entre workspace solicitado e contexto é detectado', () => {
  const result = reflect({
    parsedIntent: parsedIntent({
      entities: {
        ...parsedIntent().entities,
        workspaces: [{ id: 'workspace-2' }],
      },
    }),
  });
  assert.equal(result.ambiguityDetected, true);
  assert.ok(result.inconsistencies.some((item) => item.code === 'CONTEXT_WORKSPACE_CONFLICT'));
});

test('ausência de conta recomenda solicitação de conta', () => {
  const intent = parsedIntent();
  const result = reflect({ parsedIntent: { ...intent, entities: { ...intent.entities, accounts: [] } } });
  assert.ok(result.inconsistencies.some((item) => item.code === 'MISSING_ACCOUNT'));
  assert.ok(result.recommendations.includes('REQUEST_ACCOUNT'));
});

test('ausência de categoria recomenda solicitação de categoria', () => {
  const intent = parsedIntent();
  const result = reflect({ parsedIntent: { ...intent, entities: { ...intent.entities, categories: [] } } });
  assert.ok(result.inconsistencies.some((item) => item.code === 'MISSING_CATEGORY'));
  assert.ok(result.recommendations.includes('REQUEST_CATEGORY'));
});

test('ausência de valor recomenda solicitação de valor', () => {
  const intent = parsedIntent();
  const result = reflect({ parsedIntent: { ...intent, entities: { ...intent.entities, values: [] } } });
  assert.ok(result.inconsistencies.some((item) => item.code === 'MISSING_AMOUNT'));
  assert.ok(result.recommendations.includes('REQUEST_AMOUNT'));
});

test('ausência de data recomenda solicitação de data', () => {
  const intent = parsedIntent();
  const result = reflect({ parsedIntent: { ...intent, entities: { ...intent.entities, dates: [] } } });
  assert.ok(result.inconsistencies.some((item) => item.code === 'MISSING_DATE'));
  assert.ok(result.recommendations.includes('REQUEST_DATE'));
});

test('schema normaliza risco, confiança, identidade e versão', () => {
  const result = reflect();
  assert.equal(result.reflectionId, 'reflection-001');
  assert.equal(result.timestamp, NOW);
  assert.equal(result.metadata.version, UNI_OS_REFLECTION_SCHEMA_VERSION);
  assert.equal(createReflectionSnapshot({ overallRisk: 'INVALID' }).overallRisk, 'HIGH');
});

test('schema faz deep clone e deep freeze sem congelar entradas', () => {
  const inconsistencies = [{ code: 'TEST', detail: { safe: true } }];
  const result = createReflectionSnapshot({ inconsistencies });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.inconsistencies[0].detail), true);
  assert.equal(Object.isFrozen(inconsistencies), false);
  assert.equal(Object.isFrozen(inconsistencies[0].detail), false);
});

test('análise não modifica parsedIntent, contexto, memória ou plano', () => {
  const input = {
    parsedIntent: parsedIntent(),
    contextSnapshot: { workspace: { id: 'workspace-1' } },
    memorySnapshot: { financial: { accounts: [] } },
    planningSnapshot: plan(),
  };
  const before = structuredClone(input);
  adaptReflectionInput(input, OPTIONS);
  assert.deepEqual(input, before);
});

test('feature flag compartilhada permanece desligada', async () => {
  let observed = false;
  const result = await runReflectionAdapterShadow({}, { observer: () => { observed = true; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(observed, false);
});

test('modo sombra observa a reflexão e descarta o resultado', async () => {
  let observed = null;
  const result = await runReflectionAdapterShadow({
    parsedIntent: parsedIntent(), planningSnapshot: plan(),
  }, {
    enabled: true,
    adapterOptions: OPTIONS,
    observer: async (reflection) => { observed = reflection; },
  });
  assert.equal(observed.reflectionId, 'reflection-001');
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.reflection, null);
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runReflectionAdapterShadow({}, {
    enabled: true,
    observer: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.reflection, null);
});

test('logs DEV expõem somente risco, confiança, recomendações e flags', async () => {
  const logs = [];
  await runReflectionAdapterShadow({
    parsedIntent: parsedIntent({ originalText: 'dado financeiro privado 80' }),
    planningSnapshot: plan(),
  }, {
    enabled: true,
    isDevelopment: true,
    adapterOptions: OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Reflection/);
  assert.doesNotMatch(serialized, /privado|financial|80|originalText/i);
});
