// Testes de integração da Fase 2 do Uni Engine (ponto único de entrada).
// Inclui NÃO-REGRESSÃO: o comportamento da Fase 1 permanece intacto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from './runUniEngineShadow.js';
import {
  buildBaseInput,
  TEST_CONFIG_ENABLED,
  TEST_CONFIG_DISABLED,
  buildExpenseActionPending,
} from './testFixtures.js';
import { createOperationalMemory } from './operationalMemory.js';
import { createUniEngineConfig } from './uniEngineConfig.js';
import {
  UNI_ENGINE_VERSION,
  findFunctionsInValue,
  isSerializableValue,
} from './uniEngineContracts.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('fase2 140: resultado inclui todas as seções novas da Fase 2', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  assert.ok(result.cognitiveContext, 'contexto cognitivo presente');
  assert.ok(result.referenceResolution, 'resolução de referências presente');
  assert.ok(result.suggestions, 'sugestões presentes');
  assert.ok(result.agreementMetrics, 'métricas presentes');
  assert.ok(Array.isArray(result.divergenceDiagnostics), 'diagnósticos presentes');
  assert.equal(result.operationalMemory, null, 'sem memória injetada não expõe memória');
  assert.equal(result.diagnostics.divergenceCount, 0);
});

test('fase2 141: plano retorna expandido mantendo contratos da Fase 1', () => {
  const result = runUniEngineShadow(
    buildBaseInput({ message: { text: 'Gastei 50 reais no mercado' } }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(result.plan.decision, 'ask');
  assert.deepEqual(result.plan.missingFields, ['account']);
  assert.equal(result.plan.theoreticalExecutor, 'execute_confirmed_financial_action');
  assert.equal(result.plan.executorExpected, 'execute_confirmed_financial_action');
  assert.ok(Array.isArray(result.plan.availableData));
  assert.ok(Array.isArray(result.plan.missingData));
  assert.ok(['low', 'medium', 'high'].includes(result.plan.risk.level));
  assert.ok(Array.isArray(result.plan.ambiguities));
  assert.ok(Array.isArray(result.plan.alternatives));
});

test('fase2 142: memória injetada é atualizada e exposta como snapshot', () => {
  const memory = createOperationalMemory();
  const input = buildBaseInput({
    message: { text: 'Gastei 50 no mercado no Nubank' },
    detectedIntent: 'register_expense',
    resultType: 'ready',
  });
  const result = runUniEngineShadow(input, { config: TEST_CONFIG_ENABLED, operationalMemory: memory });
  assert.equal(memory.lastIntent, 'register_expense');
  assert.equal(memory.lastAccount, 'Nubank');
  assert.equal(memory.lastAccountId, 'acc-nubank');
  assert.equal(memory.lastValue, 50);
  assert.equal(memory.turnCount, 1);
  assert.ok(result.operationalMemory, 'snapshot exposto');
  assert.equal(result.operationalMemory.turnCount, 1);
});

test('fase2 143: segunda rodada usa a memória para resolver referência implícita', () => {
  const memory = createOperationalMemory();
  runUniEngineShadow(
    buildBaseInput({ message: { text: 'Gastei 50 no mercado no Nubank' } }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memory },
  );
  const second = runUniEngineShadow(
    buildBaseInput({ message: { text: 'lança nessa conta também' } }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memory },
  );
  assert.equal(second.referenceResolution.hasReference, true);
  assert.equal(second.referenceResolution.resolved, true);
  assert.equal(second.referenceResolution.referenceType, 'account');
  assert.equal(second.referenceResolution.resolution.value, 'Nubank');
  assert.equal(second.agreementMetrics.implicitReferenceResolved, true);
});

test('fase2 144: mudança de assunto detectada entre rodadas', () => {
  const memory = createOperationalMemory();
  runUniEngineShadow(
    buildBaseInput({ message: { text: 'Recebi 100 reais de salário' } }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memory },
  );
  const second = runUniEngineShadow(
    buildBaseInput({ message: { text: 'Gastei 30 no mercado' } }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memory },
  );
  assert.equal(second.cognitiveContext.subjectChanged, true);
  assert.equal(second.agreementMetrics.contextSwitch, true);
  assert.ok(
    second.divergenceDiagnostics.some((entry) => entry.type === 'context_switch_new_pending'),
    'mudança de assunto deve gerar diagnóstico',
  );
});

test('fase2 145: pipeline pediu conta + conta implícita → diagnóstico registrado', () => {
  const memory = createOperationalMemory();
  runUniEngineShadow(
    buildBaseInput({ message: { text: 'Gastei 50 no mercado no Nubank' } }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memory },
  );
  const second = runUniEngineShadow(
    buildBaseInput({
      message: { text: 'foi nessa conta' },
      pendingAction: buildExpenseActionPending(),
      detectedIntent: 'register_expense',
      pendingIntent: 'register_expense',
      pendingActive: true,
      resultType: 'needs_clarification',
    }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memory },
  );
  const entry = second.divergenceDiagnostics.find((item) => item.type === 'pipeline_asked_known_field');
  assert.ok(entry, 'diagnóstico esperado');
  assert.match(entry.description, /Pipeline pediu conta/);
  assert.match(entry.description, /já estava implícita/);
  assert.equal(entry.impact, 'none');
});

test('fase2 146: ação vs consulta gera diagnóstico e métricas consistentes', () => {
  const result = runUniEngineShadow(
    buildBaseInput({
      message: { text: 'Gastei 50 no mercado' },
      detectedIntent: 'check_balance',
      resultType: 'ready',
    }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(result.shadowComparison.status, 'action_query_divergence');
  const entry = result.divergenceDiagnostics.find((item) => item.type === 'action_query_divergence');
  assert.ok(entry);
  assert.equal(entry.description, 'Pipeline respondeu consulta. Engine detectou intenção de ação.');
  assert.equal(result.agreementMetrics.agreement, false);
});

test('fase2 147: sugestões nunca são usadas automaticamente (só disponibilizadas)', () => {
  const result = runUniEngineShadow(
    buildBaseInput({ message: { text: 'Gastei 50 reais no mercado' } }),
    { config: TEST_CONFIG_ENABLED },
  );
  assert.equal(result.suggestions.recommendedIntent, 'register_expense');
  assert.equal(result.suggestions.recommendedExecutor, 'execute_confirmed_financial_action');
  assert.ok(result.suggestions.recommendedQuestion);
  assert.deepEqual(result.suggestions.missingFields, ['account']);
  assert.ok(typeof result.suggestions.reason === 'string');
  assert.ok(!('executor' in result), 'top-level executor não existe');
});

test('fase2 148: saída completa continua serializável e sem funções', () => {
  const memory = createOperationalMemory();
  const result = runUniEngineShadow(
    buildBaseInput({
      message: { text: 'essa conta' },
      pendingAction: buildExpenseActionPending(),
      detectedIntent: 'register_expense',
      pendingIntent: 'register_expense',
      pendingActive: true,
    }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memory },
  );
  assert.deepEqual(findFunctionsInValue(result), []);
  assert.equal(isSerializableValue(result), true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('fase2 149: motor nunca altera entrada nem memória em rodadas inválidas', () => {
  const memory = createOperationalMemory({ lastIntent: 'check_balance', turnCount: 5 });
  const input = buildBaseInput({ message: { text: '   ' } });
  const before = JSON.stringify(input);
  const memoryBefore = JSON.stringify(memory);
  const result = runUniEngineShadow(input, {
    config: TEST_CONFIG_ENABLED,
    operationalMemory: memory,
  });
  assert.equal(result.diagnostics.errorCode, 'MESSAGE_TEXT_REQUIRED');
  assert.equal(JSON.stringify(input), before, 'entrada intocada');
  assert.equal(JSON.stringify(memory), memoryBefore, 'memória intocada em rodada inválida');
});

test('fase2 150: engine desabilitado não toca memória nem roda Fase 2', () => {
  const memory = createOperationalMemory({ lastIntent: 'check_balance' });
  const result = runUniEngineShadow(buildBaseInput(), {
    config: TEST_CONFIG_DISABLED,
    operationalMemory: memory,
  });
  assert.equal(result.skipped, true);
  assert.equal(result.cognitiveContext, null);
  assert.equal(memory.lastIntent, 'check_balance', 'memória não pode ser alterada');
});

test('fase2: telemetria inclui métricas agregadas redigidas', () => {
  const received = [];
  const telemetryConfig = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'true',
    },
  });
  const result = runUniEngineShadow(
    buildBaseInput({ message: { text: 'Gastei 50 no mercado no Nubank' } }),
    {
      config: telemetryConfig,
      telemetryAdapter: (entry) => received.push(entry),
    },
  );
  assert.equal(received.length, 1);
  const serialized = JSON.stringify(received[0]);
  assert.equal(serialized.includes('Nubank'), false);
  assert.equal(serialized.includes('user-1'), false);
  assert.equal(typeof received[0].agreement, 'boolean');
  assert.equal(typeof received[0].falsePositive, 'boolean');
  assert.equal(typeof received[0].falseNegative, 'boolean');
  assert.equal(typeof received[0].contextRecovered, 'boolean');
  assert.equal(typeof received[0].ambiguityDetected, 'boolean');
  assert.equal(typeof received[0].implicitReferenceResolved, 'boolean');
  assert.equal(typeof received[0].contextSwitch, 'boolean');
  assert.equal(typeof received[0].divergenceCount, 'number');
  assert.equal(result.diagnostics.divergenceCount, received[0].divergenceCount);
});

test('fase2: memória por conversa é isolada (chaves diferentes)', () => {
  const memoryA = createOperationalMemory();
  const memoryB = createOperationalMemory();
  runUniEngineShadow(
    buildBaseInput({ message: { text: 'Gastei 50 no mercado no Nubank' } }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memoryA },
  );
  const resultB = runUniEngineShadow(
    buildBaseInput({ message: { text: 'quanto tenho?' } }),
    { config: TEST_CONFIG_ENABLED, operationalMemory: memoryB },
  );
  assert.equal(memoryA.lastAccount, 'Nubank');
  assert.equal(memoryB.lastAccount, null, 'conversas não compartilham memória');
  assert.equal(resultB.agreementMetrics.implicitReferenceResolved, false);
});

test('fase2 não-regressão: contratos da Fase 1 permanecem válidos', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  assert.equal(result.engineVersion, UNI_ENGINE_VERSION);
  assert.equal(result.enabled, true);
  assert.equal(result.skipped, false);
  assert.ok(result.correlationId.startsWith('ue_'));
  assert.ok(result.normalizedMessage);
  assert.ok(result.classification);
  assert.ok(result.epistemicState);
  assert.ok(result.plan);
  assert.ok(result.validation);
  assert.ok(result.shadowComparison);
  assert.ok(Array.isArray(result.diagnostics.rulesUsed));
  assert.equal(result.diagnostics.errorCode, null);
});

test('fase2 não-regressão: entrada congelada permanece intocada (deepFreeze)', () => {
  const input = buildBaseInput({
    message: { text: 'essa conta' },
    pendingAction: buildExpenseActionPending(),
    detectedIntent: 'register_expense',
    pendingIntent: 'register_expense',
    pendingActive: true,
  });
  const memory = createOperationalMemory();
  const before = JSON.stringify(input);
  deepFreeze(input);
  const result = runUniEngineShadow(input, {
    config: TEST_CONFIG_ENABLED,
    operationalMemory: memory,
  });
  assert.equal(JSON.stringify(input), before);
  assert.ok(result.referenceResolution);
});
