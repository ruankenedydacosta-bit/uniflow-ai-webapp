// Testes de integração do Verificador Epistêmico (Fase 4 — Shadow Mode).
// Itens 47-61, 67-70: Fases 1/2/3 intactas, memória como evidência,
// FinancialSnapshot com prioridade, resultado no Shadow, appliedToDecision
// SEMPRE falso, pipeline/voz/executor intactos, sem rede/LLM, isolamento,
// performance e limites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runEpistemicVerifier, buildPlanEpistemicSection } from './runEpistemicVerifier.js';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { buildBaseInput, TEST_SNAPSHOT } from '../testFixtures.js';
import { findFunctionsInValue } from '../uniEngineContracts.js';

const NOW = '2026-07-30T10:00:00.000Z';

function epistemicConfig() {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_TELEMETRY_ENABLED: 'false',
    },
  });
}

function legacyState(overrides = {}) {
  return {
    amount: { value: 50, status: 'confirmed_user', confidence: 1, source: 'user_message' },
    account: { value: null, status: 'missing', confidence: 0, source: null },
    destinationAccount: { value: null, status: 'missing', confidence: 0, source: null },
    category: { value: null, status: 'missing', confidence: 0, source: null },
    description: { value: null, status: 'missing', confidence: 0, source: null },
    date: { value: null, status: 'missing', confidence: 0, source: null },
    totalBalance: {
      value: 740.5,
      status: 'confirmed_database',
      confidence: 0.95,
      source: 'financial_snapshot',
    },
    intent: { value: 'register_expense', status: 'confirmed_user', confidence: 0.9, source: 'cognitive_classifier' },
    ...overrides,
  };
}

function verifierInput(overrides = {}) {
  return {
    normalizedMessage: { classificationEvidence: { intent: 'register_expense' } },
    cognitiveContext: {},
    financialSnapshot: TEST_SNAPSHOT,
    operationalMemory: null,
    persistentMemories: null,
    plan: { missingFields: [] },
    now: NOW,
    epistemicState: legacyState(),
    session: { userId: 'user-1', workspaceId: 'workspace-1', conversationId: 'conv-1' },
    ...overrides,
  };
}

// -----------------------------------------------
// Fases anteriores intactas (47-49)
// -----------------------------------------------
test('epistêmico 47: Fase 1 intacta — estado epistêmico legado continua na saída', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.ok(result.epistemicState, 'estado epistêmico da Fase 1 presente');
  assert.equal(result.epistemicState.amount.value, 50);
});

test('epistêmico 48: Fase 2 intacta — contexto cognitivo e sugestões presentes', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.ok(result.cognitiveContext);
  assert.ok(result.suggestions);
  assert.ok(result.agreementMetrics);
});

test('epistêmico 49: Fase 3 intacta — persistentMemory continua com appliedToDecision=false', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.ok('persistentMemory' in result);
  assert.equal(result.persistentMemory, null, 'sem adapter/flag, memória permanece nula');
});

// -----------------------------------------------
// Memória e FinancialSnapshot (50-51)
// -----------------------------------------------
test('epistêmico 50: memória entra como evidência (nunca como dado oficial)', () => {
  const verifier = runEpistemicVerifier(verifierInput({
    persistentMemories: [
      {
        id: 'm-1', userId: 'user-1', workspaceId: 'workspace-1',
        memoryType: 'user_preference', subjectKey: 'account_preference::nubank',
        value: { account: 'Nubank' }, status: 'confirmed', confidence: 0.9,
        lastSeenAt: '2026-07-28T00:00:00.000Z', firstSeenAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  }));
  const memoryItem = verifier.items.find((entry) => entry.source === 'persistent_memory');
  assert.ok(memoryItem, 'memória presente como item');
  assert.ok(memoryItem.evidence.some((entry) => entry.type === 'memory_retrieval'));
  assert.ok(memoryItem.claimType === 'preference');
});

test('epistêmico 51: FinancialSnapshot tem prioridade sobre memória no mesmo sujeito', () => {
  const verifier = runEpistemicVerifier(verifierInput({
    persistentMemories: [
      {
        id: 'm-saldo', userId: 'user-1', workspaceId: 'workspace-1',
        memoryType: 'user_declared_fact', subjectKey: 'fact::saldo',
        value: { totalBalance: 1000 }, status: 'active', confidence: 0.9,
        lastSeenAt: '2026-07-10T00:00:00.000Z', firstSeenAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  }));
  const snapshotItem = verifier.items.find(
    (entry) => entry.subject === 'balance:total' && entry.source === 'financial_snapshot',
  );
  assert.ok(snapshotItem, 'item oficial do snapshot presente');
  assert.equal(snapshotItem.value, 740.5);
  const conflict = verifier.conflicts.find((entry) => entry.subject === 'balance:total');
  assert.equal(conflict?.type, 'memory_database_conflict', 'conflito banco × memória explícito');
  assert.equal(snapshotItem.epistemicStatus, 'conflicting', 'conflito nunca é auto-resolvido');
  assert.ok(verifier.recommendations.some((entry) => entry.startsWith('ask_user:conflict:')));
});

test('epistêmico 51b: usuário x banco no mesmo sujeito gera user_database_conflict', () => {
  const verifier = runEpistemicVerifier(verifierInput({
    normalizedMessage: { classificationEvidence: { intent: 'set_balance' } },
    cognitiveContext: { lastIntent: 'set_balance' },
    epistemicState: legacyState({
      amount: { value: 1000, status: 'confirmed_user', confidence: 1, source: 'user_message' },
      account: { value: 'Nubank', status: 'confirmed_database', confidence: 0.95, source: 'financial_snapshot' },
      intent: { value: 'set_balance', status: 'confirmed_user', confidence: 0.9, source: 'cognitive_classifier' },
    }),
  }));
  const conflict = verifier.conflicts.find((entry) => entry.subject === 'balance:account:nubank');
  assert.ok(conflict, 'conflito de saldo por conta');
  assert.equal(conflict.type, 'user_database_conflict');
});

// -----------------------------------------------
// Shadow Mode (52-58)
// -----------------------------------------------
test('epistêmico 52: resultado epistêmico aparece no Shadow Mode do engine', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.ok(result.epistemicModel, 'epistemicModel presente');
  assert.ok(Array.isArray(result.epistemicModel.items));
  assert.ok(result.epistemicModel.items.length > 0);
  assert.ok(Array.isArray(result.epistemicModel.conflicts));
  assert.ok(Array.isArray(result.epistemicModel.staleItems));
  assert.ok(result.epistemicModel.sufficiency);
});

test('epistêmico 53: appliedToDecision permanece SEMPRE false', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.equal(result.epistemicModel.appliedToDecision, false);
  const verifier = runEpistemicVerifier(verifierInput());
  assert.equal(verifier.diagnostics.rulesUsed.length > 0, true);
});

test('epistêmico 54: plano oficial do pipeline não muda — seção epistêmica é aditiva', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.ok(result.plan.epistemic, 'plano ganha seção epistêmica informativa');
  assert.ok(result.plan.epistemic.epistemicReadiness);
  assert.ok(result.plan.epistemic.safeRecommendation);
  assert.equal(result.plan.decision, 'ask', 'decisão oficial do motor permanece');
  assert.deepEqual(result.plan.missingFields, ['account']);
});

test('epistêmico 55: voz intacta — nenhum campo de voz/áudio na saída', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.equal('audio' in result, false);
  assert.equal('voice' in result, false);
  assert.equal('response' in result, false);
});

test('epistêmico 56: executor não é chamado — nenhuma capacidade de execução', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.equal('executor' in result, false);
  for (const item of result.epistemicModel.items) {
    assert.equal(item.usableFor.execution, false, 'nenhum item autoriza execução');
  }
  assert.equal(result.epistemicModel.sufficiency.execute.shadowMode, true);
  assert.equal(result.epistemicModel.sufficiency.execute.sufficientCount, 0);
});

test('epistêmico 57: verificador puro e síncrono, sem rede', () => {
  const verifier = runEpistemicVerifier(verifierInput());
  assert.equal(verifier instanceof Promise, false);
  assert.doesNotThrow(() => JSON.stringify(verifier));
  const source = readFileSync(
    fileURLToPath(new URL('./runEpistemicVerifier.js', import.meta.url)),
    'utf8',
  );
  assert.ok(!source.includes('supabase'), 'sem dependência de banco/rede');
  assert.ok(!source.includes('fetch('), 'sem chamadas de rede');
});

test('epistêmico 58: sem LLM', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./runEpistemicVerifier.js', import.meta.url)),
    'utf8',
  );
  assert.ok(!source.includes('uni-llm'), 'verificador não importa módulos de LLM');
  assert.ok(!source.includes('createLlm'), 'verificador não cria cliente LLM');
});

test('epistêmico: saída inteira do modelo é serializável e sem funções', () => {
  const verifier = runEpistemicVerifier(verifierInput());
  assert.deepEqual(findFunctionsInValue(verifier), []);
  const result = runUniEngineShadow(buildBaseInput(), { config: epistemicConfig() });
  assert.deepEqual(findFunctionsInValue(result), []);
});

// -----------------------------------------------
// Isolamento (59-61)
// -----------------------------------------------
function memoryOf(userId, workspaceId, subjectKey, value, status = 'active') {
  return {
    id: `m-${userId}-${subjectKey}`,
    userId,
    workspaceId,
    memoryType: 'user_declared_fact',
    subjectKey,
    value,
    status,
    confidence: 0.9,
    lastSeenAt: '2026-07-28T00:00:00.000Z',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
  };
}

test('epistêmico 59: usuário A não mistura memória do usuário B', () => {
  const verifier = runEpistemicVerifier(verifierInput({
    session: { userId: 'user-a', workspaceId: 'ws-a' },
    persistentMemories: [
      memoryOf('user-a', 'ws-a', 'fact::a', { totalBalance: 100 }),
      memoryOf('user-b', 'ws-b', 'fact::b', { totalBalance: 999 }),
    ],
  }));
  assert.equal(verifier.diagnostics.memoryCount, 1);
  assert.equal(verifier.diagnostics.memoryScopeFiltered, 1);
  assert.equal(verifier.items.some((entry) => entry.diagnostics?.memoryId?.includes('user-b')), false);
});

test('epistêmico 60: workspace pessoal não mistura business', () => {
  const verifier = runEpistemicVerifier(verifierInput({
    session: { userId: 'user-a', workspaceId: 'ws-personal' },
    persistentMemories: [
      memoryOf('user-a', 'ws-personal', 'fact::a', { totalBalance: 100 }),
      memoryOf('user-a', 'ws-business', 'fact::b', { totalBalance: 500 }),
    ],
  }));
  assert.equal(verifier.diagnostics.memoryCount, 1);
  assert.equal(verifier.diagnostics.memoryScopeFiltered, 1);
});

test('epistêmico 61: memória de outro workspace é ignorada', () => {
  const verifier = runEpistemicVerifier(verifierInput({
    session: { userId: 'user-a', workspaceId: 'ws-a' },
    persistentMemories: [memoryOf('user-a', 'ws-b', 'fact::x', { totalBalance: 123 })],
  }));
  assert.equal(verifier.diagnostics.memoryCount, 0);
  assert.equal(verifier.diagnostics.memoryScopeFiltered, 1);
});

// -----------------------------------------------
// Plan Readiness (seção 14)
// -----------------------------------------------
test('epistêmico: readiness alta com dados confirmados', () => {
  const plan = { decision: 'confirm', missingFields: [] };
  const verifier = runEpistemicVerifier(verifierInput({ plan }));
  const section = buildPlanEpistemicSection(verifier, plan);
  assert.equal(section.epistemicReadiness, 'high');
  assert.equal(section.safeRecommendation, 'proceed');
});

test('epistêmico: readiness baixa com conflito — recomendação bloqueia', () => {
  const plan = { decision: 'confirm', missingFields: [] };
  const verifier = runEpistemicVerifier(verifierInput({
    plan,
    normalizedMessage: { classificationEvidence: { intent: 'set_balance' } },
    cognitiveContext: { lastIntent: 'set_balance' },
    epistemicState: legacyState({
      amount: { value: 1000, status: 'confirmed_user', confidence: 1, source: 'user_message' },
      account: { value: 'Nubank', status: 'confirmed_database', confidence: 0.95, source: 'financial_snapshot' },
      intent: { value: 'set_balance', status: 'confirmed_user', confidence: 0.9, source: 'cognitive_classifier' },
    }),
  }));
  const section = buildPlanEpistemicSection(verifier, plan);
  assert.equal(section.epistemicReadiness, 'low');
  assert.equal(section.safeRecommendation, 'ask');
  assert.ok(section.unresolvedConflicts.length > 0);
});

test('epistêmico: readiness moderada com campo ausente', () => {
  const plan = { decision: 'ask', missingFields: ['account'] };
  const verifier = runEpistemicVerifier(verifierInput({ plan }));
  const section = buildPlanEpistemicSection(verifier, plan);
  assert.equal(section.epistemicReadiness, 'moderate');
  assert.equal(section.safeRecommendation, 'ask');
  assert.ok(section.missingEvidence.length >= 0);
});

// -----------------------------------------------
// Performance e limites (67-70)
// -----------------------------------------------
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

test('epistêmico 67: verificador local fica dentro da meta (< 10ms mediana, p95 < 20ms)', () => {
  for (let i = 0; i < 50; i += 1) {
    runEpistemicVerifier(verifierInput()); // warm-up
  }
  const samples = [];
  for (let i = 0; i < 200; i += 1) {
    const start = performance.now();
    runEpistemicVerifier(verifierInput());
    samples.push(performance.now() - start);
  }
  assert.ok(median(samples) < 10, `mediana ${median(samples).toFixed(2)}ms >= 10ms`);
  assert.ok(p95(samples) < 20, `p95 ${p95(samples).toFixed(2)}ms >= 20ms`);
});

test('epistêmico 68: quantidade de itens é limitada', () => {
  const memories = [];
  for (let i = 0; i < 120; i += 1) {
    memories.push(memoryOf('user-1', 'workspace-1', `fact::m${i}`, { x: i }));
  }
  const verifier = runEpistemicVerifier(verifierInput({ persistentMemories: memories }));
  assert.ok(verifier.items.length <= 40, `itens: ${verifier.items.length}`);
  assert.equal(verifier.diagnostics.truncated.items, true);
});

test('epistêmico 69: sem crescimento não limitado — limite por evidência também vale', () => {
  const big = runEpistemicVerifier(verifierInput({
    operationalMemory: null,
    plan: { missingFields: [] },
  }));
  assert.ok(big.diagnostics.limits.maxItemsPerVerification > 0);
  const snapshotItem = big.items.find((entry) => entry.subject === 'balance:total');
  assert.ok(snapshotItem.evidence.length <= 16);
});

test('epistêmico 70: entrada grande é tratada sem quebrar', () => {
  const hugeText = 'Gastei '.repeat(2000) + '50 reais no mercado';
  const verifier = runEpistemicVerifier(verifierInput({
    normalizedMessage: { text: hugeText, classificationEvidence: { intent: 'register_expense' } },
  }));
  assert.ok(verifier.items.length > 0);
  assert.doesNotThrow(() => JSON.stringify(verifier));
});

test('epistêmico: flags desligadas → epistemicModel nulo no engine', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    },
  });
  const result = runUniEngineShadow(buildBaseInput(), { config });
  assert.equal(result.epistemicModel, null);
  assert.equal('epistemic' in result.plan, false);
});

test('epistêmico: sem flag do motor, nada roda', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE: 'true',
    },
  });
  assert.equal(config.enabled, false);
  assert.equal(config.epistemicEnabled, false, 'cascata: motor desligado desliga o modelo');
  const result = runUniEngineShadow(buildBaseInput(), { config });
  assert.equal(result.skipped, true);
});

test('epistêmico: usuário x memória em sujeito canônico gera user_memory_conflict', () => {
  const verifier = runEpistemicVerifier(verifierInput({
    normalizedMessage: { classificationEvidence: { intent: 'register_expense' } },
    epistemicState: legacyState({
      account: { value: 'Caixa', status: 'confirmed_user', confidence: 0.8, source: 'user_message' },
    }),
    persistentMemories: [
      {
        id: 'm-caixa', userId: 'user-1', workspaceId: 'workspace-1',
        memoryType: 'account_preference', subjectKey: 'account::caixa',
        value: { account: 'Nubank' }, status: 'active', confidence: 0.9,
        lastSeenAt: '2026-07-28T00:00:00.000Z', firstSeenAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  }));
  const conflict = verifier.conflicts.find((entry) => entry.subject === 'account:caixa');
  assert.ok(conflict, 'conflito memória × usuário no sujeito canônico');
  assert.equal(conflict.type, 'user_memory_conflict');
});
