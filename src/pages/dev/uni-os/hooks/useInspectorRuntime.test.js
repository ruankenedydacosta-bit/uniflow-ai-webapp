import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AUTO_REFRESH_INTERVAL_MS,
  REDACTED,
  buildInspectorStages,
  loadInspectorRuntime,
  sanitizeInspectorSnapshot,
  startInspectorAutoRefresh,
} from './useInspectorRuntime.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function createObservedResult(overrides = {}) {
  return deepFreeze({
    runtimeId: 'internal-runtime-id',
    timestamp: '2026-07-12T20:18:42.000Z',
    parsedIntent: {},
    context: {},
    memory: {},
    planning: { executionAllowed: false, steps: [] },
    reflection: { executionAllowed: false },
    security: { executionAllowed: false },
    permissions: { executionAllowed: false },
    cognition: { shouldInvokeModel: false },
    structuredResponse: { executionAllowed: false },
    communication: { executionAllowed: false },
    executionAllowed: false,
    completed: true,
    metadata: { version: '1.0', shadowMode: true },
    ...overrides,
  });
}

function createRunner(result = createObservedResult(), status = 'OBSERVED') {
  return async (_input, options) => {
    options.observer?.(result);
    return {
      status,
      result: null,
      telemetry: {
        pipelineDurationMs: 12.5,
        adaptersExecuted: [
          'context', 'memory', 'planning', 'reflection', 'security',
          'permissions', 'cognitive', 'structured_response', 'communication',
        ],
        validationErrors: [],
      },
    };
  };
}

test('Inspector conecta ao runtime real em modo sombra', async () => {
  const state = await loadInspectorRuntime();

  assert.equal(state.status, 'completed');
  assert.equal(state.runtime.source, 'runtime');
  assert.equal(state.runtime.shadowMode, true);
  assert.equal(state.runtime.executionAllowed, false);
  assert.equal(state.runtime.adaptersExecuted, 9);
});

test('adapter usa observer e mantém retorno do runtime descartado', async () => {
  let receivedOptions;
  const runner = async (_input, options) => {
    receivedOptions = options;
    options.observer(createObservedResult());
    return {
      status: 'OBSERVED',
      result: null,
      telemetry: { pipelineDurationMs: 4, adaptersExecuted: [], validationErrors: [] },
    };
  };
  const state = await loadInspectorRuntime({ runner });

  assert.equal(receivedOptions.enabled, true);
  assert.equal(state.runtime.source, 'runtime');
  assert.equal(state.runtime.featureFlag, false);
});

test('sanitização remove IDs, descrições e credenciais sem mutar o snapshot', () => {
  const snapshot = {
    runtimeId: 'uuid-interno',
    description: 'Pagamento confidencial',
    profile: {
      email: 'pessoa@example.com',
      phone: '(11) 99999-9999',
      cpf: '123.456.789-00',
      token: 'segredo',
    },
    accounts: [{ id: 'account-id', name: 'Conta privada' }],
    safeStatus: 'COMPLETED',
  };
  const sanitized = sanitizeInspectorSnapshot(snapshot);

  assert.equal(sanitized.runtimeId, REDACTED);
  assert.equal(sanitized.description, REDACTED);
  assert.equal(sanitized.profile.email, REDACTED);
  assert.equal(sanitized.profile.phone, REDACTED);
  assert.equal(sanitized.profile.cpf, REDACTED);
  assert.equal(sanitized.profile.token, REDACTED);
  assert.deepEqual(sanitized.accounts, [REDACTED]);
  assert.equal(sanitized.safeStatus, 'COMPLETED');
  assert.equal(snapshot.description, 'Pagamento confidencial');
});

test('sanitização detecta valores sensíveis mesmo sob chave desconhecida', () => {
  const sanitized = sanitizeInspectorSnapshot({
    first: 'financeiro@uniflow.ai',
    second: '123.456.789-00',
    third: '4111 1111 1111 1111',
    fourth: 'service_role',
  });

  assert.deepEqual(sanitized, {
    first: REDACTED,
    second: REDACTED,
    third: REDACTED,
    fourth: REDACTED,
  });
});

test('falha controlada usa mock sem quebrar a interface', async () => {
  const state = await loadInspectorRuntime({
    runner: async () => ({ status: 'FAILED_SAFE', result: null, telemetry: null }),
  });

  assert.equal(state.status, 'failed');
  assert.equal(state.runtime.source, 'mock');
  assert.equal(state.runtime.executionAllowed, false);
});

test('exceção do runtime também usa fallback mock', async () => {
  const state = await loadInspectorRuntime({
    runner: async () => {
      throw new Error('runtime unavailable');
    },
  });

  assert.equal(state.runtime.source, 'mock');
  assert.equal(state.runtime.validationResult, 'Mock fallback');
});

test('snapshots vazios são normalizados sem liberar execução', async () => {
  const state = await loadInspectorRuntime({ runner: createRunner(createObservedResult()) });

  assert.deepEqual(state.runtime.parsedIntent, {});
  assert.deepEqual(state.runtime.context, {});
  assert.equal(state.runtime.executionAllowed, false);
  assert.equal(Object.isFrozen(state.runtime), true);
});

test('timeline reflete execução completa, atualização e fallback sombra', () => {
  const completed = buildInspectorStages({
    runtime: { source: 'runtime', adaptersExecuted: 9 },
    status: 'completed',
  });
  const running = buildInspectorStages({
    runtime: { source: 'runtime', adaptersExecuted: 0 },
    status: 'running',
  });
  const fallback = buildInspectorStages({
    runtime: { source: 'mock', adaptersExecuted: 0 },
    status: 'failed',
  });

  assert.equal(completed.every((stage) => stage.status === 'completed'), true);
  assert.equal(running[0].status, 'running');
  assert.equal(running.slice(1).every((stage) => stage.status === 'waiting'), true);
  assert.equal(fallback.some((stage) => stage.status === 'failed'), true);
});

test('auto refresh usa dois segundos e fornece cleanup de unmount', () => {
  let scheduledCallback;
  let scheduledInterval;
  let clearedId;
  const stop = startInspectorAutoRefresh(() => {}, {
    setIntervalFn(callback, interval) {
      scheduledCallback = callback;
      scheduledInterval = interval;
      return 42;
    },
    clearIntervalFn(id) {
      clearedId = id;
    },
  });

  assert.equal(typeof scheduledCallback, 'function');
  assert.equal(scheduledInterval, AUTO_REFRESH_INTERVAL_MS);
  assert.equal(scheduledInterval, 2000);
  stop();
  assert.equal(clearedId, 42);
});

test('hook expõe refresh manual e invalida requisições ao desmontar', async () => {
  const source = await readFile(new URL('./useInspectorRuntime.js', import.meta.url), 'utf8');

  assert.match(source, /refresh,/);
  assert.match(source, /stopAutoRefresh\?\.\(\)/);
  assert.match(source, /mountedRef\.current = false/);
  assert.match(source, /requestRef\.current \+= 1/);
});
