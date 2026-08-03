import assert from 'node:assert/strict';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../adapters/featureFlags.js';
import {
  RUNTIME_ADAPTER_ORDER,
  runUniOSRuntimeShadow,
  uniOSRuntime,
  validateRuntimeInvariants,
} from './index.js';

const NOW = '2026-07-13T04:00:00.000Z';

function runtimeInput(overrides = {}) {
  return {
    parsedIntent: {
      id: 'intent-1',
      intent: 'register_expense',
      confidence: 0.95,
      requiresConfirmation: true,
      attentionType: 'financial_action',
      entities: {
        accounts: [{ normalized: 'nubank', display: 'Nubank' }],
        categories: [{ normalized: 'alimentacao', display: 'Alimentação' }],
        merchants: [], values: [80], dates: ['2026-07-13'], workspaces: [],
      },
    },
    runtimeContext: {
      contextSources: {
        sessionContext: {
          isAuthenticated: true,
          session: { id: 'session-1' },
          user: { id: 'user-1' },
        },
        profile: { id: 'user-1', onboarding_completed: true },
        workspace: { id: 'workspace-1', role: 'owner' },
        channel: 'text',
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        personalityMode: 'balanced',
      },
      memorySources: {
        workspaceId: 'workspace-1',
        conversationMemory: {
          memories: [{
            id: 'memory-1',
            type: 'conversation_preference',
            value: { profile_id: 'warm' },
            source: 'explicit_user',
            confirmed: true,
          }],
        },
      },
    },
    ...overrides,
  };
}

function runtimeOptions(overrides = {}) {
  return {
    enabled: true,
    now: () => NOW,
    idFactory: () => 'runtime-001',
    adapterOptions: {
      planning: { idFactory: () => 'plan-001' },
      reflection: { idFactory: () => 'reflection-001' },
      security: { idFactory: () => 'security-001' },
      permissions: { idFactory: () => 'permissions-001' },
      cognitive: { idFactory: () => 'gateway-001' },
      structuredResponse: { idFactory: () => 'response-001' },
      communication: { idFactory: () => 'communication-001' },
    },
    ...overrides,
  };
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

test('pipeline completo produz todos os snapshots', async () => {
  const result = await uniOSRuntime.process(runtimeInput(), runtimeOptions());
  assert.equal(result.completed, true);
  assert.equal(result.runtimeId, 'runtime-001');
  assert.equal(result.context.workspace.id, 'workspace-1');
  assert.equal(result.memory.preferences.conversation[0].mode, 'warm');
  assert.equal(result.planning.executionAllowed, false);
  assert.equal(result.reflection.executionAllowed, false);
  assert.equal(result.security.executionAllowed, false);
  assert.equal(result.permissions.executionAllowed, false);
  assert.equal(result.cognition.route, 'NOT_IMPLEMENTED');
  assert.equal(result.structuredResponse.communication.emotion, null);
  assert.equal(result.communication.personality, 'FRIENDLY');
});

test('ordem obrigatória contém todos os adapters sem saltos', async () => {
  const result = await uniOSRuntime.process(runtimeInput(), runtimeOptions());
  assert.deepEqual(result.metadata.telemetry.adaptersExecuted, RUNTIME_ADAPTER_ORDER);
  assert.equal(result.metadata.telemetry.adaptersExecuted.length, 9);
});

test('todos os snapshots e o resultado permanecem deep frozen', async () => {
  const result = await uniOSRuntime.process(runtimeInput(), runtimeOptions());
  assert.equal(isDeepFrozen(result), true);
  assert.equal(isDeepFrozen(result.parsedIntent), true);
  assert.equal(isDeepFrozen(result.communication), true);
});

test('runtime nunca permite execução, modelo ou saída de voz', async () => {
  const result = await uniOSRuntime.process(runtimeInput(), runtimeOptions());
  assert.equal(result.executionAllowed, false);
  assert.equal(result.cognition.shouldInvokeModel, false);
  assert.equal(result.cognition.metadata.externalCallMade, false);
  assert.equal(result.communication.outputChannel, null);
  assert.equal(result.communication.voiceProfile, null);
});

test('inputs e providers de memória não são alterados ou congelados', async () => {
  const input = runtimeInput();
  const before = structuredClone(input);
  await uniOSRuntime.process(input, runtimeOptions());
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.runtimeContext.memorySources), false);
});

test('feature flag compartilhada mantém runtime completamente inativo', async () => {
  let called = false;
  const result = await uniOSRuntime.process(runtimeInput(), {
    adapters: { context: () => { called = true; } },
  });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result, null);
  assert.equal(called, false);
});

test('modo sombra executa pipeline e descarta o resultado', async () => {
  let observed = null;
  const result = await runUniOSRuntimeShadow(runtimeInput(), {
    ...runtimeOptions(),
    observer: async (runtimeResult) => { observed = runtimeResult; },
  });
  assert.equal(observed.completed, true);
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.result, null);
  assert.equal(result.telemetry.shadowExecutions, 1);
});

test('telemetria contém somente métricas técnicas determinísticas', async () => {
  const times = [10, 17.5];
  const result = await uniOSRuntime.process(runtimeInput(), runtimeOptions({
    clock: () => times.shift(),
  }));
  assert.equal(result.metadata.telemetry.pipelineDurationMs, 7.5);
  assert.deepEqual(result.metadata.telemetry.validationErrors, []);
  assert.equal(result.metadata.telemetry.shadowExecutions, 1);
  assert.equal('parsedIntent' in result.metadata.telemetry, false);
});

test('runtime vazio percorre todo pipeline com defaults seguros', async () => {
  const result = await uniOSRuntime.process({}, runtimeOptions());
  assert.equal(result.completed, true);
  assert.deepEqual(result.parsedIntent, {});
  assert.deepEqual(result.metadata.telemetry.adaptersExecuted, RUNTIME_ADAPTER_ORDER);
  assert.equal(result.executionAllowed, false);
});

test('objetos inválidos são normalizados para entrada vazia segura', async () => {
  const result = await uniOSRuntime.process(null, runtimeOptions());
  assert.equal(result.completed, true);
  assert.deepEqual(result.parsedIntent, {});
  assert.deepEqual(result.context.workspace, { id: null, role: null });
});

test('invariantes detectam ordem, congelamento e execução inválidos', () => {
  const validation = validateRuntimeInvariants({
    parsedIntent: {}, context: {}, memory: {}, planning: { executionAllowed: true },
    reflection: {}, security: {}, permissions: {}, cognition: {},
    structuredResponse: {}, communication: {},
  }, ['context']);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('ADAPTER_ORDER_INVALID'));
  assert.ok(validation.errors.includes('SNAPSHOT_NOT_FROZEN:parsedIntent'));
  assert.ok(validation.errors.includes('EXECUTION_NOT_BLOCKED:planning'));
});

test('falha de adapter é contida e registrada sem detalhes internos', async () => {
  let telemetry = null;
  const result = await uniOSRuntime.process(runtimeInput(), runtimeOptions({
    adapters: { planning: async () => { throw new Error('private financial detail'); } },
    onTelemetry: (value) => { telemetry = value; },
  }));
  assert.equal(result, null);
  assert.deepEqual(telemetry.validationErrors, ['PIPELINE_FAILURE']);
  assert.deepEqual(telemetry.adaptersExecuted, ['context', 'memory', 'planning']);
  assert.doesNotMatch(JSON.stringify(telemetry), /private|financial/i);
});

test('observador com falha não escapa do modo sombra', async () => {
  const result = await runUniOSRuntimeShadow(runtimeInput(), {
    ...runtimeOptions(),
    observer: async () => { throw new Error('observer'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.result, null);
});

test('logs DEV expõem somente início, fim e métricas técnicas', async () => {
  const logs = [];
  await uniOSRuntime.process(runtimeInput({
    parsedIntent: { intent: 'question', originalText: 'dado privado 80' },
  }), runtimeOptions({
    isDevelopment: true,
    logger: { info: (...args) => logs.push(args) },
  }));
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /Pipeline Started/);
  assert.match(serialized, /Pipeline Finished/);
  assert.doesNotMatch(serialized, /privado|originalText|80/i);
});

test('pipeline completo não chama fetch ou API externa', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('external call'); };
  try {
    const result = await uniOSRuntime.process(runtimeInput(), runtimeOptions());
    assert.equal(result.completed, true);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
