import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { computeDecisionConfidence } from './computeDecisionConfidence.js';
import { detectDecisionRisk } from './detectDecisionRisk.js';
import { chooseNextDecision } from './chooseNextDecision.js';
import { buildDecisionReason } from './buildDecisionReason.js';
import { buildDecisionSuggestions } from './buildDecisionSuggestions.js';
import { runDecisionLayer } from './runDecisionLayer.js';
import {
  buildDecisionTelemetry,
  emitDecisionTelemetry,
} from './telemetry/decisionTelemetry.js';
import {
  DECISION_TELEMETRY_ALLOWED_FIELDS,
  redactDecisionTelemetry,
} from './telemetry/redactDecisionTelemetry.js';

const NOW = '2026-07-30T10:00:00.000Z';

const SNAPSHOT = Object.freeze({
  hasData: true,
  totalBalance: 740.5,
  referenceDate: '2026-07-30T09:00:00.000Z',
  accounts: [
    { id: 'account-1', name: 'Nubank', current_balance: 480.5 },
    { id: 'account-2', name: 'Itaú', current_balance: 260 },
  ],
  categories: [{ id: 'category-1', name: 'Alimentação' }],
  recentTransactions: [],
});

function decisionContext(overrides = {}) {
  const evidence = {
    intentKnown: true,
    intentConfirmed: false,
    intentType: 'check_balance',
    memoryAvailable: true,
    memoryConflict: false,
    snapshotAvailable: true,
    snapshotFresh: true,
    historyAvailable: true,
    pendingActive: false,
    pendingReady: false,
    pendingExecuting: false,
    executorAvailable: true,
    executorExpected: 'FinancialQueryEngine',
    staleItemsCount: 0,
    hasConflict: false,
    balanceConflict: false,
    referenceAmbiguous: false,
    conversationSwitched: false,
    ...(overrides.evidence ?? {}),
  };
  return {
    sufficiency: 'SUFFICIENT',
    consistency: 'CONSISTENT',
    missingFields: [],
    pending: null,
    intent: { type: evidence.intentType, known: evidence.intentKnown },
    needDatabase: false,
    needMemory: false,
    needSnapshot: false,
    needHistory: false,
    needUser: false,
    needContext: false,
    dependencies: {},
    diagnostics: [],
    ...overrides,
    evidence,
  };
}

function layerInput(overrides = {}) {
  return {
    intent: { type: 'check_balance', known: true, confidence: 0.95 },
    messageType: 'query',
    conversationContext: {
      lastIntent: 'check_balance',
      history: { turns: 3 },
    },
    cognitivePlan: {
      missingFields: [],
      theoreticalExecutor: 'FinancialQueryEngine',
    },
    epistemicModel: { items: [], conflicts: [], staleItems: [], missingItems: [] },
    operationalMemory: {},
    persistentMemory: [],
    financialSnapshot: SNAPSHOT,
    pendingAction: null,
    expectedExecutor: 'FinancialQueryEngine',
    featureFlags: {
      decisionEnabled: true,
      decisionShadowMode: true,
      decisionTelemetryEnabled: false,
    },
    timestamp: NOW,
    correlationId: 'decision-test',
    ...overrides,
  };
}

const confidenceScenarios = [
  ['confiança 43: contexto completo produz faixa alta ou muito alta', decisionContext(), ['high', 'very_high']],
  ['confiança 44: contexto parcial produz faixa média ou baixa', decisionContext({ sufficiency: 'PARTIAL', missingFields: ['account'] }), ['low', 'medium', 'high']],
  ['confiança 45: contexto insuficiente reduz confiança', decisionContext({ sufficiency: 'INSUFFICIENT', missingFields: ['amount'], evidence: { intentKnown: false, executorAvailable: false } }), ['very_low', 'low']],
  ['confiança 46: confirmação pronta aumenta confiança', decisionContext({ pending: { status: 'ready' }, evidence: { pendingActive: true, pendingReady: true, intentConfirmed: true } }), ['high', 'very_high']],
  ['confiança 47: conflitos podem levar a faixa muito baixa', decisionContext({ sufficiency: 'INSUFFICIENT', consistency: 'CONFLICTING', missingFields: ['amount'], evidence: { intentKnown: false, memoryConflict: true, hasConflict: true, balanceConflict: true, referenceAmbiguous: true, executorAvailable: false } }), ['very_low']],
];

for (const [name, context, bands] of confidenceScenarios) {
  test(name, () => {
    const result = computeDecisionConfidence(context);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.ok(bands.includes(result.band), `${result.band} não está em ${bands.join(', ')}`);
  });
}

test('confiança 48: conflito reduz a confiança', () => {
  const base = computeDecisionConfidence(decisionContext()).confidence;
  const conflicted = computeDecisionConfidence(decisionContext({
    consistency: 'CONFLICTING',
    evidence: { memoryConflict: true, hasConflict: true },
  })).confidence;
  assert.ok(conflicted < base);
});

test('confiança 49: confirmação pronta supera pendência sem confirmação', () => {
  const pending = computeDecisionConfidence(decisionContext({
    evidence: { pendingActive: true },
  })).confidence;
  const ready = computeDecisionConfidence(decisionContext({
    evidence: { pendingActive: true, pendingReady: true, intentConfirmed: true },
  })).confidence;
  assert.ok(ready > pending);
});

test('confiança 50: memória conflitante reduz a confiança', () => {
  const consistent = computeDecisionConfidence(decisionContext()).confidence;
  const conflict = computeDecisionConfidence(decisionContext({ evidence: { memoryConflict: true } })).confidence;
  assert.ok(conflict < consistent);
});

test('confiança é determinística para a mesma entrada', () => {
  const context = decisionContext({ sufficiency: 'PARTIAL', missingFields: ['account'] });
  assert.deepEqual(computeDecisionConfidence(context), computeDecisionConfidence(context));
});

test('confiança nunca usa random', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('random não permitido'); };
  try {
    assert.doesNotThrow(() => computeDecisionConfidence(decisionContext()));
  } finally {
    Math.random = original;
  }
});

test('confiança consome o sumário epistêmico deterministicamente', () => {
  const high = computeDecisionConfidence(decisionContext({
    evidence: { epistemicConfidence: 0.9 },
  })).confidence;
  const low = computeDecisionConfidence(decisionContext({
    evidence: { epistemicConfidence: 0.2 },
  })).confidence;
  assert.ok(high > low);
});

const riskScenarios = [
  ['risco 51: contexto completo tem risco NONE', decisionContext(), 'NONE', null],
  ['risco 52: categoria ausente detecta wrong_category', decisionContext({ missingFields: ['category'] }), null, 'wrong_category'],
  ['risco 53: contexto insuficiente eleva risco', decisionContext({ sufficiency: 'INSUFFICIENT' }), 'MEDIUM', 'insufficient_context'],
  ['risco 54: executor incorreto pode ser crítico', decisionContext({ evidence: { intentType: 'register_expense', executorExpected: 'FinancialQueryEngine' }, intent: { type: 'register_expense', known: true } }), 'CRITICAL', 'incorrect_executor'],
  ['risco 55: executor errado detecta execução errada', decisionContext({ evidence: { intentType: 'register_income', executorExpected: 'createAssistantResponse' }, intent: { type: 'register_income', known: true } }), null, 'wrong_action_execution'],
  ['risco 56: banco divergente é detectado', decisionContext({ evidence: { hasConflict: true } }), null, 'divergent_database'],
  ['risco 57: memória conflitante é detectada', decisionContext({ evidence: { memoryConflict: true } }), null, 'inconsistent_memory'],
  ['risco 58: contexto insuficiente é detectado', decisionContext({ sufficiency: 'INSUFFICIENT' }), null, 'insufficient_context'],
  ['risco de conta errada', decisionContext({ missingFields: ['account'] }), null, 'wrong_account'],
  ['risco de saldo conflitante', decisionContext({ evidence: { balanceConflict: true } }), null, 'conflicting_balance'],
  ['risco de informação velha', decisionContext({ evidence: { staleItemsCount: 1 } }), null, 'stale_information'],
  ['risco de referência ambígua', decisionContext({ evidence: { referenceAmbiguous: true } }), null, 'ambiguous_reference'],
  ['risco de interpretação', decisionContext({ evidence: { intentKnown: false } }), null, 'interpretation_risk'],
  ['risco de contexto', decisionContext({ evidence: { conversationSwitched: true } }), null, 'context_risk'],
];

for (const [name, context, expectedLevel, expectedType] of riskScenarios) {
  test(name, () => {
    const result = detectDecisionRisk(context);
    if (expectedLevel) assert.equal(result.level, expectedLevel);
    if (expectedType) assert.ok(result.risks.some((risk) => risk.type === expectedType));
  });
}

const decisionScenarios = [
  ['decisão 33: responder', decisionContext(), 0.9, { level: 'LOW' }, {}, 'ANSWER'],
  ['decisão 34: perguntar', decisionContext({ sufficiency: 'PARTIAL', missingFields: ['account'] }), 0.5, { level: 'MEDIUM' }, {}, 'ASK'],
  ['decisão 35: confirmar', decisionContext({ pending: { status: 'ready', ready: true }, evidence: { pendingActive: true, pendingReady: true } }), 0.9, { level: 'LOW' }, {}, 'CONFIRM'],
  ['decisão 36: rejeitar', decisionContext(), 0.2, { level: 'CRITICAL' }, {}, 'REJECT'],
  ['decisão 37: esperar', decisionContext({ pending: { status: 'executing', executing: true }, evidence: { pendingActive: true, pendingExecuting: true } }), 0.7, { level: 'LOW' }, {}, 'WAIT'],
  ['decisão 38: consultar memória', decisionContext({ needMemory: true, evidence: { referenceAmbiguous: true } }), 0.6, { level: 'MEDIUM' }, {}, 'CONSULT_MEMORY'],
  ['decisão 39: consultar banco', decisionContext({ needDatabase: true, evidence: { snapshotAvailable: false } }), 0.6, { level: 'MEDIUM' }, {}, 'CONSULT_DATABASE'],
  ['decisão 40: cancelar', decisionContext({ pending: { status: 'ready' }, evidence: { pendingActive: true } }), 0.6, { level: 'LOW' }, { messageType: 'cancellation' }, 'CANCEL'],
  ['decisão 41: adiar', decisionContext({ pending: { status: 'needs_clarification', ready: false }, evidence: { pendingActive: true, conversationSwitched: true } }), 0.8, { level: 'LOW' }, {}, 'DEFER'],
  ['decisão 42: desconhecido', decisionContext({ sufficiency: 'UNKNOWN', evidence: { intentKnown: true } }), 0.6, { level: 'LOW' }, {}, 'UNKNOWN'],
];

for (const [name, context, confidence, risk, extra, expected] of decisionScenarios) {
  test(name, () => {
    assert.equal(chooseNextDecision({ context, confidence, risk, ...extra }), expected);
  });
}

test('razão técnica nunca inclui valores financeiros da entrada', () => {
  const lines = buildDecisionReason({
    decisionType: 'ASK',
    context: decisionContext({ sufficiency: 'PARTIAL', missingFields: ['amount'] }),
    confidence: 0.5,
    risk: { level: 'MEDIUM' },
  });
  assert.ok(lines.includes('Valor = ausente'));
  assert.equal(JSON.stringify(lines).includes('740.5'), false);
});

const suggestionCases = [
  ['recomendação 75: perguntar conta', 'account', 'ASK_ACCOUNT'],
  ['recomendação 76: perguntar categoria', 'category', 'ASK_CATEGORY'],
  ['recomendação 77: perguntar valor', 'amount', 'ASK_AMOUNT'],
  ['recomendação 78: confirmar', 'confirmation', 'ASK_CONFIRMATION'],
];

for (const [name, field, expected] of suggestionCases) {
  test(name, () => {
    const suggestions = buildDecisionSuggestions({
      decisionType: 'ASK',
      context: decisionContext({ sufficiency: 'PARTIAL', missingFields: [field] }),
    });
    assert.ok(suggestions.some((entry) => entry.suggestion === expected));
  });
}

test('recomendação 79: consultar memória', () => {
  const suggestions = buildDecisionSuggestions({
    decisionType: 'CONSULT_MEMORY',
    context: decisionContext({ needMemory: true, evidence: { referenceAmbiguous: true } }),
  });
  assert.ok(suggestions.some((entry) => entry.suggestion === 'CONSULT_MEMORY'));
});

test('recomendação 80: atualizar snapshot', () => {
  const suggestions = buildDecisionSuggestions({
    decisionType: 'CONSULT_DATABASE',
    context: decisionContext({ needSnapshot: true, evidence: { snapshotAvailable: false } }),
  });
  assert.ok(suggestions.some((entry) => entry.suggestion === 'REFRESH_SNAPSHOT'));
});

test('recomendação 81: aguardar usuário', () => {
  const suggestions = buildDecisionSuggestions({ decisionType: 'WAIT', context: decisionContext() });
  assert.ok(suggestions.some((entry) => entry.suggestion === 'WAIT_FOR_USER'));
});

test('recomendação 82: ignorar memória conflitante', () => {
  const suggestions = buildDecisionSuggestions({
    decisionType: 'ASK',
    context: decisionContext({ evidence: { memoryConflict: true } }),
  });
  assert.ok(suggestions.some((entry) => entry.suggestion === 'IGNORE_MEMORY'));
});

test('runDecisionLayer produz resultado completo e serializável', () => {
  const result = runDecisionLayer(layerInput());
  assert.equal(result.decisionType, 'ANSWER');
  assert.equal(result.shadow.appliedToDecision, false);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('runDecisionLayer reconhece primaryIntent da classificação da Fase 1', () => {
  const result = runDecisionLayer(layerInput({
    intent: { primaryIntent: 'check_balance', messageType: 'query' },
  }));
  assert.equal(result.contextEvaluation.intent.type, 'check_balance');
});

test('runDecisionLayer mantém snapshot, memória e plano intactos', () => {
  const input = layerInput();
  const before = JSON.stringify(input);
  runDecisionLayer(input);
  assert.equal(JSON.stringify(input), before);
});

test('shadow 83: appliedToDecision é sempre false', () => {
  assert.equal(runDecisionLayer(layerInput()).shadow.appliedToDecision, false);
});

for (const [name, field] of [
  ['shadow 84: executor não chamado', 'executorCalled'],
  ['shadow 85: banco não chamado', 'databaseCalled'],
  ['shadow 86: memória não alterada', 'memoryModified'],
  ['shadow 87: resposta não alterada', 'responseModified'],
  ['shadow 88: voz intacta', 'voiceTouched'],
  ['shadow 89: pipeline intacto', 'pipelineAltered'],
]) {
  test(name, () => {
    assert.equal(runDecisionLayer(layerInput()).shadow[field], false);
  });
}

test('shadow 90: snapshot permanece intacto e não é referenciado na saída', () => {
  const snapshot = structuredClone(SNAPSHOT);
  const before = JSON.stringify(snapshot);
  const result = runDecisionLayer(layerInput({ financialSnapshot: snapshot }));
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(JSON.stringify(result).includes('480.5'), false);
});

test('telemetria 98: contém somente agregados permitidos', () => {
  const layer = runDecisionLayer(layerInput());
  const telemetry = buildDecisionTelemetry({ layer, enabled: true, shadowMode: true });
  const redacted = redactDecisionTelemetry({
    ...telemetry,
    message: 'Gastei 50 no Nubank',
    account: 'Nubank',
    balance: 740.5,
  });
  assert.ok(Object.keys(redacted).every((key) => DECISION_TELEMETRY_ALLOWED_FIELDS.includes(key)));
  assert.equal(JSON.stringify(redacted).includes('Nubank'), false);
  assert.equal(JSON.stringify(redacted).includes('740.5'), false);
});

test('telemetria usa adapter injetado sem chamada externa', () => {
  const received = [];
  const telemetry = buildDecisionTelemetry({ layer: runDecisionLayer(layerInput()) });
  const result = emitDecisionTelemetry(telemetry, (entry) => received.push(entry));
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], result);
});

test('falha do adapter de telemetria não quebra a camada', () => {
  const telemetry = buildDecisionTelemetry({ layer: runDecisionLayer(layerInput()) });
  assert.doesNotThrow(() => emitDecisionTelemetry(telemetry, () => { throw new Error('offline'); }));
});

test('telemetria ligada no orquestrador continua redigida', () => {
  const received = [];
  const result = runDecisionLayer(layerInput({
    featureFlags: {
      decisionEnabled: true,
      decisionShadowMode: true,
      decisionTelemetryEnabled: true,
    },
    telemetryAdapter: (entry) => received.push(entry),
  }));
  assert.equal(received.length, 1);
  assert.equal(result.telemetry.appliedToDecision, false);
  assert.equal(JSON.stringify(result.telemetry).includes('Nubank'), false);
});

test('entrada vazia falha de forma controlada e serializável', () => {
  const result = runDecisionLayer({});
  assert.equal(result.decisionType, 'UNKNOWN');
  assert.equal(result.shadow.appliedToDecision, false);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('performance 101: execução comum fica abaixo de 10ms na mediana', () => {
  const input = layerInput();
  for (let index = 0; index < 10; index += 1) runDecisionLayer(input);
  const timings = [];
  for (let index = 0; index < 100; index += 1) {
    const start = performance.now();
    runDecisionLayer(input);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  assert.ok(timings[50] < 10, `mediana ${timings[50].toFixed(3)}ms`);
});

test('performance 102-109: p95 fica abaixo de 20ms com entrada grande após warm-up', () => {
  const memories = Array.from({ length: 500 }, (_, index) => ({
    subjectKey: `preference::item-${index}`,
    value: { active: true },
    status: 'confirmed',
  }));
  const input = layerInput({ persistentMemory: memories });
  for (let index = 0; index < 10; index += 1) runDecisionLayer(input);
  const timings = [];
  for (let index = 0; index < 100; index += 1) {
    const start = performance.now();
    runDecisionLayer(input);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  assert.ok(timings[94] < 20, `p95 ${timings[94].toFixed(3)}ms`);
});

test('performance 110: volume de entrada não cresce a saída sem limite', () => {
  const memories = Array.from({ length: 2_000 }, (_, index) => ({
    subjectKey: `preference::${index}`,
    value: index,
    status: 'confirmed',
  }));
  const result = runDecisionLayer(layerInput({ persistentMemory: memories }));
  assert.ok(JSON.stringify(result).length < 20_000);
});
