// Testes de integração do Shadow Mode do Uni Engine (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from './runUniEngineShadow.js';
import {
  buildBaseInput,
  TEST_CONFIG_ENABLED,
  TEST_CONFIG_DISABLED,
  buildExpenseActionPending,
  buildReadyActionPending,
} from './testFixtures.js';
import { createUniEngineConfig } from './uniEngineConfig.js';
import { UNI_ENGINE_VERSION, findFunctionsInValue, isSerializableValue } from './uniEngineContracts.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('shadow 49: entrada válida retorna resultado descartável sem exceção', () => {
  const input = buildBaseInput();
  const result = runUniEngineShadow(input, { config: TEST_CONFIG_DISABLED });
  assert.ok(result, 'motor deve retornar sempre um resultado');
  assert.equal(result.enabled, false);
  assert.equal(result.skipped, true);
});

test('shadow 50: entrada inválida não quebra o chat e reporta código', () => {
  const result = runUniEngineShadow(
    buildBaseInput({ message: { text: '   ' } }),
    { config: TEST_CONFIG_ENABLED, isDev: false },
  );
  assert.equal(result.diagnostics.errorCode, 'MESSAGE_TEXT_REQUIRED');
  assert.equal(result.plan, null);
});

test('shadow 51: latência de mensagem comum fica abaixo da meta de 20 ms', () => {
  const input = buildBaseInput();
  const options = { config: TEST_CONFIG_ENABLED };

  // Warm-up: fora da medição, aquece JIT/módulos (a primeira chamada de
  // caminho completo do processo sofre cold start e gerava falso flake).
  for (let i = 0; i < 5; i += 1) {
    runUniEngineShadow(input, options);
  }

  // Medição: 30 execuções e mediana — imune a outliers únicos de GC/scheduler.
  const executions = 30;
  const latencies = [];
  for (let i = 0; i < executions; i += 1) {
    const start = performance.now();
    runUniEngineShadow(input, options);
    latencies.push(performance.now() - start);
  }
  latencies.sort((a, b) => a - b);
  const median = latencies[Math.floor(executions / 2)];
  assert.ok(
    median < 20,
    `mediana observada: ${median.toFixed(2)} ms em ${executions} execuções`,
  );
});

test('shadow 54: resultado completo respeita o contrato de saída', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  assert.equal(result.enabled, true);
  assert.equal(result.skipped, false);
  assert.equal(result.engineVersion, UNI_ENGINE_VERSION);
  assert.ok(result.correlationId.startsWith('ue_'));
  assert.ok(result.normalizedMessage, 'mensagem normalizada presente');
  assert.ok(result.classification, 'classificação presente');
  assert.ok(result.epistemicState, 'estado epistêmico presente');
  assert.ok(result.plan, 'plano presente');
  assert.ok(result.validation, 'validação presente');
  assert.ok(result.shadowComparison, 'comparação presente');
  assert.ok(Array.isArray(result.diagnostics.rulesUsed));
  assert.ok(Array.isArray(result.diagnostics.ambiguities));
  assert.equal(result.diagnostics.errorCode, null);
});

test('shadow 55: saída nunca contém funções nem dados não serializáveis', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  assert.deepEqual(findFunctionsInValue(result), [], 'nenhuma função pode vazar na saída');
  assert.equal(isSerializableValue(result), true, 'saída deve ser 100% serializável');
});

test('shadow 56: config desabilitada → ENGINE_DISABLED sem rodar nada', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_DISABLED });
  assert.equal(result.skipped, true);
  assert.equal(result.diagnostics.errorCode, 'ENGINE_DISABLED');
  assert.equal(result.normalizedMessage, null);
});

test('shadow 57: entrada nula nunca lança exceção', () => {
  const result = runUniEngineShadow(null, { config: TEST_CONFIG_ENABLED });
  assert.equal(result.diagnostics.errorCode, 'INPUT_NOT_OBJECT');
});

test('shadow 58: o motor nunca altera a entrada nem o pipeline', () => {
  const input = buildBaseInput({
    message: { text: 'Gastei 50 reais no mercado' },
    pendingAction: buildExpenseActionPending(),
    detectedIntent: 'question',
    pendingIntent: 'register_expense',
    pendingActive: true,
    resultType: 'needs_clarification',
  });
  const snapshotBefore = JSON.stringify(input);
  deepFreeze(input);
  runUniEngineShadow(input, { config: TEST_CONFIG_ENABLED });
  assert.equal(JSON.stringify(input), snapshotBefore, 'entrada deve permanecer intocada');
});

test('shadow 59: pendência ativa + ação nova explícita gera divergência diagnóstica', () => {
  const result = runUniEngineShadow(
    buildBaseInput({
      message: { text: 'Recebi 100 reais pelo Nubank' },
      pendingAction: buildExpenseActionPending(),
      detectedIntent: 'register_expense',
      pendingIntent: 'register_expense',
      pendingActive: true,
      resultType: 'needs_clarification',
    }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(result.classification.messageType, 'action');
  assert.equal(result.classification.primaryIntent, 'register_income');
  assert.equal(result.shadowComparison.status, 'pending_context_divergence');
  assert.equal(result.shadowComparison.severity, 'high');
});

test('shadow 60: campo ausente gera plano ask com próxima pergunta', () => {
  const result = runUniEngineShadow(
    buildBaseInput({ message: { text: 'Gastei 50 reais no mercado' } }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(result.plan.decision, 'ask');
  assert.deepEqual(result.plan.missingFields, ['account']);
  assert.equal(result.plan.nextQuestion.field, 'account_id');
  assert.equal(result.validation.requiresClarification, true);
});

test('shadow 61: comparação concorda quando motor e pipeline alinham', () => {
  const result = runUniEngineShadow(
    buildBaseInput({
      message: { text: 'Gastei 50 no mercado pelo Nubank' },
      detectedIntent: 'register_expense',
      resultType: 'ready',
    }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(result.plan.decision, 'confirm');
  assert.equal(result.shadowComparison.status, 'agreement');
  assert.equal(result.shadowComparison.engineIntent, 'register_expense');
  assert.equal(result.shadowComparison.pipelineIntent, 'register_expense');
});

test('shadow 62: telemetria só sai com telemetryEnabled e sempre redigida', () => {
  const received = [];
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'true',
    },
  });
  const input = buildBaseInput({ message: { text: 'Gastei 50 reais no mercado' } });
  runUniEngineShadow(input, { config, telemetryAdapter: (entry) => received.push(entry) });
  assert.equal(received.length, 1, 'telemetria deve ser emitida quando habilitada');
  const serialized = JSON.stringify(received[0]);
  assert.equal(serialized.includes('Gastei'), false);
  assert.equal(serialized.includes('user-1'), false);
  assert.equal(received[0].engineIntent, 'register_expense');

  const silent = [];
  runUniEngineShadow(input, {
    config: TEST_CONFIG_ENABLED,
    telemetryAdapter: (entry) => silent.push(entry),
  });
  assert.equal(silent.length, 0, 'telemetria desabilitada não deve emitir nada');
});

test('shadow 63: correlationId injetado é preservado na resposta', () => {
  const result = runUniEngineShadow(buildBaseInput(), {
    config: TEST_CONFIG_ENABLED,
    correlationId: 'ue_trace_abc',
  });
  assert.equal(result.correlationId, 'ue_trace_abc');
});

test('shadow 64: pergunta fora do domínio cai no fallback de consulta, sem erro', () => {
  const result = runUniEngineShadow(
    buildBaseInput({ message: { text: 'qual é a capital do brasil?' } }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(result.classification.messageType, 'query');
  assert.equal(result.classification.primaryIntent, 'question');
  assert.equal(result.plan.decision, 'respond');
  assert.equal(result.validation.valid, true);
  assert.equal(result.diagnostics.errorCode, null);
});

test('shadow 65: ação destrutiva é rejeitada com plano reject e sem erro interno', () => {
  const result = runUniEngineShadow(
    buildBaseInput({ message: { text: 'apaga tudo' } }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(result.classification.primaryIntent, 'safety_blocked');
  assert.equal(result.plan.decision, 'reject');
  assert.ok(result.plan.blockers.length > 0, 'plano deve detalhar o bloqueio');
  assert.equal(result.diagnostics.errorCode, null);
});

test('shadow: confirmação e cancelamento com pendência permanecem alinhados', () => {
  const ready = buildReadyActionPending();
  const confirmed = runUniEngineShadow(
    buildBaseInput({
      message: { text: 'sim' },
      pendingAction: ready,
      detectedIntent: 'confirm',
      pendingIntent: 'register_expense',
      pendingActive: true,
      resultType: 'ready',
    }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(confirmed.classification.messageType, 'confirmation');
  assert.equal(confirmed.plan.decision, 'confirm');
  assert.equal(confirmed.shadowComparison.status, 'agreement');

  const cancelled = runUniEngineShadow(
    buildBaseInput({
      message: { text: 'não' },
      pendingAction: ready,
      detectedIntent: 'cancel',
      pendingIntent: 'register_expense',
      pendingActive: true,
      resultType: 'ready',
    }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(cancelled.classification.messageType, 'cancellation');
  assert.equal(cancelled.plan.decision, 'cancel');
  assert.equal(cancelled.shadowComparison.status, 'agreement');
});

test('shadow: performance — p95 abaixo de 20 ms em 100 execuções', () => {
  const input = buildBaseInput({ message: { text: 'Gastei 50 reais no mercado' } });
  const options = { config: TEST_CONFIG_ENABLED };

  // Warm-up fora da medição (mesmo motivo do shadow 51: evitar cold start).
  for (let i = 0; i < 5; i += 1) {
    runUniEngineShadow(input, options);
  }

  const latencies = [];
  for (let i = 0; i < 100; i += 1) {
    const start = performance.now();
    runUniEngineShadow(input, options);
    latencies.push(performance.now() - start);
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies[94];
  assert.ok(p95 < 20, `p95 observado: ${p95.toFixed(2)} ms`);
});
