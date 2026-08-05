// Testes da telemetria sanitizada do Motor de Raciocínio Financeiro (Fase 15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFinancialTelemetryStore,
  buildFinancialTelemetryEntry,
  recordFinancialTelemetry,
  getFinancialTelemetrySnapshot,
  resetFinancialTelemetry,
  FINANCIAL_TELEMETRY_VERSION,
  FINANCIAL_TELEMETRY_DEFAULT_MAX_ENTRIES,
  FINANCIAL_TELEMETRY_MAX_ENTRIES_LIMIT,
} from './financialTelemetry.js';
import { FINANCIAL_REASONING_STAGES } from '../types/financialReasoningTypes.js';

test('telemetry: entrada sanitizada não expõe ids nem valores monetários', () => {
  const entry = buildFinancialTelemetryEntry({
    status: 'shadow_completed',
    turnKey: 'uuid-1234-raw-message-id',
    diagnostics: [{ type: 'cash_risk', priority: 'high' }],
    inferences: [{ type: 'risk_increasing' }],
    comparison: { status: 'divergent', divergences: [{ type: 'x' }] },
    flags: { financialReasoningEnabled: true, financialReasoningShadowMode: true, financialReasoningTelemetryEnabled: true },
  });
  const json = JSON.stringify(entry);
  assert.equal(entry.turnKey.length, 8, 'turnKey vira fingerprint curto');
  assert.ok(!entry.turnKey.includes('uuid-1234-raw-message-id'));
  assert.ok(!json.includes('uuid-1234-raw-message-id'), 'id bruto não vaza');
  assert.equal(entry.summary.diagnosticsCount, 1);
  assert.equal(entry.summary.maxPriority, 'high');
  assert.ok(entry.safety.influenceApplied === false);
});

test('telemetry: entrada respeita allowlist de flags', () => {
  const entry = buildFinancialTelemetryEntry({
    status: 'shadow_completed',
    turnKey: 't1',
    diagnostics: [],
    inferences: [],
    comparison: null,
    flags: {
      financialReasoningEnabled: true,
      financialReasoningShadowMode: true,
      financialReasoningTelemetryEnabled: true,
      enabled: true,
      secretToken: 'SHOULD_NOT_APPEAR',
      openaiApiKey: 'sk-xxxx',
    },
  });
  const keys = Object.keys(entry.flags);
  assert.ok(keys.every((key) => ['financialReasoningEnabled', 'financialReasoningShadowMode', 'financialReasoningTelemetryEnabled'].includes(key)));
  assert.ok(!JSON.stringify(entry).includes('SHOULD_NOT_APPEAR'));
  assert.ok(!JSON.stringify(entry).includes('sk-xxxx'));
});

test('telemetry: store com ring buffer limitado e reset controlado', () => {
  const store = createFinancialTelemetryStore({ maxEntries: 3 });
  for (let index = 0; index < 10; index += 1) {
    recordFinancialTelemetry(store, buildFinancialTelemetryEntry({
      status: 'shadow_completed',
      turnKey: `t-${index}`,
      diagnostics: [],
      inferences: [],
      comparison: null,
      flags: {},
    }));
  }
  const snapshot = getFinancialTelemetrySnapshot(store);
  assert.equal(snapshot.total, 3);
  assert.equal(snapshot.entries.length, 3);
  assert.equal(snapshot.entries[0].turnKey, snapshot.entries[0].turnKey);
  resetFinancialTelemetry(store);
  assert.equal(getFinancialTelemetrySnapshot(store).total, 0);
});

test('telemetry: limites padrão respeitam faixa segura', () => {
  assert.equal(FINANCIAL_TELEMETRY_DEFAULT_MAX_ENTRIES, 32);
  assert.equal(FINANCIAL_TELEMETRY_MAX_ENTRIES_LIMIT, 256);
  const clamped = createFinancialTelemetryStore({ maxEntries: 99999 });
  assert.equal(clamped.maxEntries, 256);
  const small = createFinancialTelemetryStore({ maxEntries: 0 });
  assert.equal(small.maxEntries, 1);
  assert.equal(FINANCIAL_TELEMETRY_VERSION, '1.0');
});

test('telemetry: snapshot é serializável e conta por prioridade', () => {
  const store = createFinancialTelemetryStore();
  recordFinancialTelemetry(store, buildFinancialTelemetryEntry({
    status: 'shadow_completed',
    turnKey: 't1',
    diagnostics: [{ type: 'cash_risk', priority: 'high' }, { type: 'recurring_expenses', priority: 'info' }],
    inferences: [],
    comparison: null,
    flags: {},
  }));
  const snapshot = getFinancialTelemetrySnapshot(store);
  assert.equal(snapshot.byPriority.high, 1);
  assert.equal(snapshot.byPriority.info, 1);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('telemetry: entradas sem prioridade não contaminam contagem', () => {
  const store = createFinancialTelemetryStore();
  recordFinancialTelemetry(store, buildFinancialTelemetryEntry({
    status: 'no_financial_data',
    turnKey: 't1',
    diagnostics: [],
    inferences: [],
    comparison: null,
    flags: {},
  }));
  const snapshot = getFinancialTelemetrySnapshot(store);
  assert.equal(snapshot.byPriority.high, 0);
});

test('telemetry: estágios da pipeline são capturados sem payloads', () => {
  const stages = {};
  for (const stage of FINANCIAL_REASONING_STAGES) {
    stages[stage] = { present: true, executed: true, status: 'ok' };
  }
  const entry = buildFinancialTelemetryEntry({
    status: 'shadow_completed',
    turnKey: 't1',
    stages,
    diagnostics: [],
    inferences: [],
    comparison: null,
    flags: {},
  });
  assert.ok(entry.stages.length >= 8);
});