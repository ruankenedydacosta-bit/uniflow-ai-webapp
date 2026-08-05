// Testes do Shadow Runtime do Motor de Raciocínio Financeiro (Fase 15, Bloco 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runFinancialReasoningShadow,
  resetGlobalFinancialReasoningTelemetryStore,
  getGlobalFinancialReasoningTelemetryStore,
} from './runFinancialReasoningShadow.js';
import { createFinancialTelemetryStore } from '../telemetry/financialTelemetry.js';
import { FINANCIAL_REASONING_STAGES } from '../types/financialReasoningTypes.js';

const ENABLED_CONFIG = Object.freeze({
  financialReasoningEnabled: true,
  financialReasoningShadowMode: true,
  financialReasoningTelemetryEnabled: false,
});

const DISABLED_CONFIG = Object.freeze({
  financialReasoningEnabled: false,
  financialReasoningShadowMode: false,
  financialReasoningTelemetryEnabled: false,
});

const FIXTURE_INPUT = Object.freeze({
  accounts: [
    { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500 },
    { id: 'acc-2', name: 'Poupança', account_type: 'savings', current_balance: 5000 },
    { id: 'acc-4', name: 'Cartão', account_type: 'credit_card', current_balance: -1200, credit_limit: 5000 },
  ],
  categories: [{ id: 'cat-2', name: 'Moradia', transaction_type: 'expense' }],
  transactions: [
    { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 6000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-2', description: 'Salário' },
    { id: 'tx-2', account_id: 'acc-4', transaction_type: 'expense', amount: 900, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Aluguel' },
  ],
});

test('shadow: com flag desligada retorna engine_disabled e não roda nada', () => {
  const result = runFinancialReasoningShadow({
    config: DISABLED_CONFIG,
    turnId: 't-1',
    messageId: 'm-1',
    input: FIXTURE_INPUT,
  });
  assert.equal(result.status, 'engine_disabled');
  assert.equal(result.mode, 'shadow');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.discarded, true);
  assert.equal(result.snapshot.present, false);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.inferences, []);
  assert.equal(result.plan.present, false);
  assert.equal(result.comparison.present, false);
});

test('shadow: com flag ligada roda pipeline completa e nunca aplica', () => {
  const result = runFinancialReasoningShadow({
    config: ENABLED_CONFIG,
    turnId: 't-1',
    messageId: 'm-1',
    input: FIXTURE_INPUT,
    legacy: { totalBalance: 5300, monthlyIncome: 6000, monthlyExpense: 900, riskSignaled: false, creditSignaled: false, goalSignaled: false },
    referenceDate: '2026-08-15',
  });
  assert.equal(result.status, 'shadow_completed');
  assert.equal(result.shadowMode, true);
  assert.equal(result.influenceApplied, false);
  assert.equal(result.legacyPreserved, true);
  assert.equal(result.executed, false);
  assert.equal(result.persisted, false);
  assert.equal(result.discarded, true);
  assert.ok(result.snapshot.balance.total > 0, 'snapshot presente');
  assert.equal(result.influenceApplied, false);
  assert.ok(result.diagnostics.length >= 0);
  assert.ok(result.plan.objectives.length >= 0);
  assert.ok(result.comparison.status === 'aligned' || result.comparison.status === 'divergent');
});

test('shadow: pipeline executa estágios na ordem fixa do Bloco 7', () => {
  const result = runFinancialReasoningShadow({
    config: ENABLED_CONFIG,
    turnId: 't-1',
    messageId: 'm-1',
    input: FIXTURE_INPUT,
    referenceDate: '2026-08-15',
  });
  const executed = FINANCIAL_REASONING_STAGES.filter((stage) => result.stages[stage]?.executed === true);
  assert.ok(executed.includes('entry'));
  assert.ok(executed.includes('snapshot'));
  assert.ok(executed.includes('diagnostics'));
  assert.ok(executed.includes('inference'));
  assert.ok(executed.includes('planning'));
  assert.ok(executed.includes('comparison'));
  assert.ok(!executed.includes('discarded'), 'discarded é estado final, não execução');
});

test('shadow: sem dados financeiros retorna no_financial_data', () => {
  const result = runFinancialReasoningShadow({
    config: ENABLED_CONFIG,
    turnId: 't-1',
    messageId: 'm-1',
    input: {},
  });
  assert.equal(result.status, 'no_financial_data');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.discarded, true);
  assert.deepEqual(result.diagnostics, []);
});

test('shadow: entradas inválidas nunca lançam', () => {
  const result = runFinancialReasoningShadow({});
  assert.equal(result.status, 'engine_disabled');
  const garbage = runFinancialReasoningShadow({
    config: ENABLED_CONFIG,
    turnId: 42,
    input: { accounts: 'x', transactions: null, workspaceBalance: 'abc' },
  });
  assert.equal(garbage.turnId, null);
  assert.ok(['shadow_completed', 'no_financial_data', 'shadow_fallback'].includes(garbage.status));
});

test('shadow: resultado é 100% serializável (JSON-safe, sem funções/Date/Map)', () => {
  const result = runFinancialReasoningShadow({
    config: ENABLED_CONFIG,
    turnId: 't-1',
    messageId: 'm-1',
    input: FIXTURE_INPUT,
    referenceDate: '2026-08-15',
  });
  const json = JSON.stringify(result);
  assert.doesNotThrow(() => json);
  assert.deepEqual(JSON.parse(json), result);
  assert.equal(result.serializable, true);
  const walk = (value) => {
    if (value && typeof value === 'object') {
      assert.ok(['Object', 'Array'].includes(value.constructor.name), 'apenas plain objects');
      for (const entry of Object.values(value)) walk(entry);
    }
  };
  walk(result);
});

test('shadow: determinístico para o mesmo turno (deduplicação idempotente)', () => {
  const options = {
    config: ENABLED_CONFIG,
    turnId: 't-9',
    messageId: 'm-9',
    input: FIXTURE_INPUT,
    referenceDate: '2026-08-15',
  };
  const first = runFinancialReasoningShadow(options);
  const second = runFinancialReasoningShadow(options);
  assert.deepEqual(first.snapshot, second.snapshot);
  assert.deepEqual(first.diagnostics, second.diagnostics);
  assert.equal(first.status, second.status);
  assert.equal(first.influenceApplied, false);
  assert.equal(second.influenceApplied, false);
});

test('shadow: telemetria só grava quando habilitada e com store', () => {
  resetGlobalFinancialReasoningTelemetryStore();
  const store = createFinancialTelemetryStore();
  const withTelemetry = runFinancialReasoningShadow({
    config: { ...ENABLED_CONFIG, financialReasoningTelemetryEnabled: true },
    turnId: 't-1',
    messageId: 'm-1',
    input: FIXTURE_INPUT,
    referenceDate: '2026-08-15',
    telemetryStore: store,
  });
  assert.ok(withTelemetry.telemetry, 'telemetria presente quando habilitada');
  const snapshot = store.entries;
  assert.equal(snapshot.length, 1);

  const withoutTelemetry = runFinancialReasoningShadow({
    config: ENABLED_CONFIG,
    turnId: 't-2',
    messageId: 'm-2',
    input: FIXTURE_INPUT,
    referenceDate: '2026-08-15',
    telemetryStore: store,
  });
  assert.equal(withoutTelemetry.telemetry, null, 'sem flag, telemetria fica nula');
  assert.equal(store.entries.length, 1, 'sem flag, nada é gravado');
});

test('shadow: safety reporta ausência total de efeitos externos', () => {
  const result = runFinancialReasoningShadow({
    config: ENABLED_CONFIG,
    turnId: 't-1',
    messageId: 'm-1',
    input: FIXTURE_INPUT,
    referenceDate: '2026-08-15',
  });
  const safety = result.safety;
  for (const key of Object.keys(safety)) {
    assert.equal(safety[key], false, `${key} deve permanecer false`);
  }
});

test('shadow: store global é resetável e observável', () => {
  resetGlobalFinancialReasoningTelemetryStore();
  const globalStore = getGlobalFinancialReasoningTelemetryStore();
  assert.ok(globalStore);
  assert.equal(globalStore.entries.length, 0);
});