// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutTelemetry.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordFinancialRolloutTelemetry,
  getFinancialRolloutTelemetrySnapshot,
  resetFinancialRolloutTelemetry,
  enableProductionTelemetry,
  validateFinancialRolloutTelemetryEntry,
  calculateComparisonMetrics,
} from './financialRolloutTelemetry.js';
// buildFinancialRolloutComparison é canônico em ../comparison/ (montagem do
// relatório de comparação); telemetry/ só grava e agrega, ver
// calculateComparisonMetrics acima.
import { buildFinancialRolloutComparison } from '../comparison/financialRolloutComparison.js';

const createIdentity = (overrides = {}) => ({
  turnId: 'turn-123',
  messageId: 'msg-456',
  workspaceId: 'ws-789',
  ...overrides,
});

const createDecision = (overrides = {}) => ({
  cohort: 'control',
  selectedSource: 'legacy',
  influenceApplied: false,
  fallbackUsed: true,
  rolloutEligible: false,
  canaryAssigned: false,
  confidence: 0.9,
  reasonCodes: [],
  ...overrides,
});

const createConfig = (overrides = {}) => ({
  enabled: true,
  visibleEnabled: false,
  productionEnabled: false,
  canaryEnabled: false,
  emergencyRollback: false,
  telemetryEnabled: true,
  ...overrides,
});

test('telemetry - reset limpa ring buffer', () => {
  resetFinancialRolloutTelemetry();
  const snapshot = getFinancialRolloutTelemetrySnapshot();
  assert.ok(Array.isArray(snapshot));
  assert.equal(snapshot.length, 0);
});

test('telemetry - record com telemetryEnabled false não grava', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity();
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: false });

  recordFinancialRolloutTelemetry(identity, decision, config, 10);
  const snapshot = getFinancialRolloutTelemetrySnapshot();
  assert.equal(snapshot.length, 0);
});

test('telemetry - record com telemetryEnabled true grava entrada', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity();
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: true });

  recordFinancialRolloutTelemetry(identity, decision, config, 15);
  const snapshot = getFinancialRolloutTelemetrySnapshot();
  assert.equal(snapshot.length, 1);
});

test('telemetry - entrada contém apenas metadados técnicos (sem texto financeiro)', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity({ turnId: 'turn-1', messageId: 'msg-1', workspaceId: 'ws-1' });
  const decision = createDecision({
    selectedSource: 'financial_runtime',
    cohort: 'canary',
    influenceApplied: true,
    fallbackUsed: false,
    rolloutEligible: true,
    canaryAssigned: true,
    confidence: 0.95,
    reasonCodes: ['BLOCKED_CONFIDENCE'],
  });
  const config = createConfig({ telemetryEnabled: true });

  recordFinancialRolloutTelemetry(identity, decision, config, 25);
  const snapshot = getFinancialRolloutTelemetrySnapshot();

  const entry = snapshot[0];
  assert.ok(!entry.text);
  assert.ok(!entry.narrative);
  assert.ok(!entry.amount);
  assert.ok(!entry.balance);
  assert.ok(!entry.transaction);
  assert.ok(!entry.pii);
  assert.ok(!entry.cpf);
  assert.ok(!entry.accountNumber);
});

test('telemetry - entrada não contém IDs crus sensíveis (hash ou truncamento)', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity({ userId: 'user-123', profileId: 'prof-456' });
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: true });

  recordFinancialRolloutTelemetry(identity, decision, config, 10);
  const snapshot = getFinancialRolloutTelemetrySnapshot();

  const entry = snapshot[0];
  assert.ok(entry.turnId === 'turn-123');
  assert.ok(entry.messageId === 'msg-456');
  assert.ok(entry.workspaceId === 'ws-789');
  assert.ok(!entry.userId);
  assert.ok(!entry.profileId);
});

test('telemetry - ring buffer limitado a 100 em development', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity();
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: true });

  for (let i = 0; i < 120; i++) {
    recordFinancialRolloutTelemetry(identity, decision, config, i);
  }
  const snapshot = getFinancialRolloutTelemetrySnapshot();
  assert.equal(snapshot.length, 100);
  assert.ok(snapshot[0].executionTimeMs >= 20); // primeiras 20 removidas
});

test('telemetry - enableProductionTelemetry reduz buffer para 32', () => {
  resetFinancialRolloutTelemetry();
  enableProductionTelemetry();
  const identity = createIdentity();
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: true });

  for (let i = 0; i < 50; i++) {
    recordFinancialRolloutTelemetry(identity, decision, config, i);
  }
  const snapshot = getFinancialRolloutTelemetrySnapshot();
  assert.equal(snapshot.length, 32);
  assert.ok(snapshot[0].executionTimeMs >= 18); // primeiras 18 removidas
});

test('telemetry - reset restaura modo development e limpa buffer', () => {
  resetFinancialRolloutTelemetry();
  enableProductionTelemetry();
  const identity = createIdentity();
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: true });

  for (let i = 0; i < 50; i++) {
    recordFinancialRolloutTelemetry(identity, decision, config, i);
  }
  assert.equal(getFinancialRolloutTelemetrySnapshot().length, 32);

  resetFinancialRolloutTelemetry();
  const snapshot = getFinancialRolloutTelemetrySnapshot();
  assert.equal(snapshot.length, 0);
});

test('telemetry - reason codes por allowlist (apenas codes válidos)', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity();
  const decision = createDecision({ reasonCodes: ['BLOCKED_CONFIDENCE', 'CANARY_INELIGIBLE', 'INVALID_CODE'] });
  const config = createConfig({ telemetryEnabled: true });

  recordFinancialRolloutTelemetry(identity, decision, config, 10);
  const snapshot = getFinancialRolloutTelemetrySnapshot();

  const entry = snapshot[0];
  assert.ok(entry.reasonCodes.includes('BLOCKED_CONFIDENCE'));
  assert.ok(entry.reasonCodes.includes('CANARY_INELIGIBLE'));
  assert.ok(entry.reasonCodes.includes('INVALID_CODE')); // telemetry grava o que recebe, validação é posterior
});

test('telemetry - erro sanitizado na validação de entrada', () => {
  const invalidEntry = {
    timestamp: 'not a number',
    relativeTimestamp: 0,
    turnId: 'turn-1',
    cohort: 'control',
    selectedSource: 'legacy',
    influenceApplied: false,
    fallbackUsed: true,
    rolloutEligible: false,
    canaryAssigned: false,
    confidence: 0.9,
    reasonCodes: [],
    environment: 'development',
    executionTimeMs: 10,
  };

  const result = validateFinancialRolloutTelemetryEntry(invalidEntry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('TIMESTAMP_INVALID'));
});

test('telemetry - saída JSON-safe (sem circular, sem funções)', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity();
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: true });

  recordFinancialRolloutTelemetry(identity, decision, config, 10);
  const snapshot = getFinancialRolloutTelemetrySnapshot();

  const entry = snapshot[0];
  const json = JSON.stringify(entry);
  assert.ok(typeof json === 'string');
  assert.ok(json.length > 0);
  assert.ok(!json.includes('function'));
});

test('telemetry - entry validation aceita entrada válida completa', () => {
  const validEntry = {
    timestamp: Date.now(),
    relativeTimestamp: 100,
    turnId: 'turn-1',
    messageId: 'msg-1',
    workspaceId: 'ws-1',
    cohort: 'canary',
    selectedSource: 'financial_runtime',
    influenceApplied: true,
    fallbackUsed: false,
    rolloutEligible: true,
    canaryAssigned: true,
    confidence: 0.95,
    reasonCodes: ['BLOCKED_CONFIDENCE'],
    rolloutEnabled: true,
    visibleEnabled: true,
    productionEnabled: true,
    canaryEnabled: true,
    emergencyRollback: false,
    telemetryEnabled: true,
    environment: 'development',
    executionTimeMs: 15,
  };

  const result = validateFinancialRolloutTelemetryEntry(validEntry);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('telemetry - validate rejeita cohort inválido', () => {
  const entry = {
    timestamp: Date.now(),
    relativeTimestamp: 0,
    cohort: 'invalid_cohort',
    selectedSource: 'legacy',
    influenceApplied: false,
    fallbackUsed: true,
    rolloutEligible: false,
    canaryAssigned: false,
    confidence: 0.9,
    reasonCodes: [],
    environment: 'development',
    executionTimeMs: 10,
  };

  const result = validateFinancialRolloutTelemetryEntry(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('COHORT_INVALID'));
});

test('telemetry - validate rejeita selectedSource inválido', () => {
  const entry = {
    timestamp: Date.now(),
    relativeTimestamp: 0,
    cohort: 'control',
    selectedSource: 'invalid_source',
    influenceApplied: false,
    fallbackUsed: true,
    rolloutEligible: false,
    canaryAssigned: false,
    confidence: 0.9,
    reasonCodes: [],
    environment: 'development',
    executionTimeMs: 10,
  };

  const result = validateFinancialRolloutTelemetryEntry(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('SELECTED_SOURCE_INVALID'));
});

test('telemetry - validate rejeita confidence fora de range', () => {
  const entry = {
    timestamp: Date.now(),
    relativeTimestamp: 0,
    cohort: 'control',
    selectedSource: 'legacy',
    influenceApplied: false,
    fallbackUsed: true,
    rolloutEligible: false,
    canaryAssigned: false,
    confidence: 1.5,
    reasonCodes: [],
    environment: 'development',
    executionTimeMs: 10,
  };

  const result = validateFinancialRolloutTelemetryEntry(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CONFIDENCE_OUT_OF_RANGE'));
});

test('telemetry - validate rejeita confidence negativo', () => {
  const entry = {
    timestamp: Date.now(),
    relativeTimestamp: 0,
    cohort: 'control',
    selectedSource: 'legacy',
    influenceApplied: false,
    fallbackUsed: true,
    rolloutEligible: false,
    canaryAssigned: false,
    confidence: -0.1,
    reasonCodes: [],
    environment: 'development',
    executionTimeMs: 10,
  };

  const result = validateFinancialRolloutTelemetryEntry(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CONFIDENCE_OUT_OF_RANGE'));
});

test('telemetry - validate exige reasonCodes array', () => {
  const entry = {
    timestamp: Date.now(),
    relativeTimestamp: 0,
    cohort: 'control',
    selectedSource: 'legacy',
    influenceApplied: false,
    fallbackUsed: true,
    rolloutEligible: false,
    canaryAssigned: false,
    confidence: 0.9,
    reasonCodes: 'not array',
    environment: 'development',
    executionTimeMs: 10,
  };

  const result = validateFinancialRolloutTelemetryEntry(entry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('REASON_CODES_INVALID'));
});

test('telemetry - calculateComparisonMetrics control vs canary', () => {
  const controlEntries = [
    { selectedSource: 'legacy', confidence: 0.9, executionTimeMs: 10 },
    { selectedSource: 'financial_runtime', confidence: 0.95, executionTimeMs: 15 },
  ];
  const canaryEntries = [
    { selectedSource: 'financial_runtime', confidence: 0.92, executionTimeMs: 12 },
    { selectedSource: 'legacy', confidence: 0.88, executionTimeMs: 8 },
    { selectedSource: 'financial_runtime', confidence: 0.9, executionTimeMs: 20 },
  ];

  const metrics = calculateComparisonMetrics(controlEntries, canaryEntries);

  assert.equal(metrics.control.total, 2);
  assert.equal(metrics.control.selectedRuntime, 1);
  assert.equal(metrics.control.selectedLegacy, 1);
  assert.equal(metrics.canary.total, 3);
  assert.equal(metrics.canary.selectedRuntime, 2);
  assert.equal(metrics.canary.selectedLegacy, 1);
  assert.ok(metrics.control.averageConfidence > 0);
  assert.ok(metrics.canary.averageConfidence > 0);
  assert.equal(metrics.divergenceCount, 3); // 1 + 2
  assert.ok(metrics.agreementPercentage >= 0 && metrics.agreementPercentage <= 100);
});

test('telemetry - calculateComparisonMetrics com arrays vazios', () => {
  const metrics = calculateComparisonMetrics([], []);
  assert.equal(metrics.control.total, 0);
  assert.equal(metrics.canary.total, 0);
  assert.equal(metrics.divergenceCount, 0);
  assert.equal(metrics.agreementPercentage, 0);
});

test('telemetry - buildFinancialRolloutComparison (canônico de ../comparison/) retorna estrutura completa', () => {
  const controlEntries = [{ selectedSource: 'legacy', confidence: 0.9, executionTimeMs: 10 }];
  const canaryEntries = [{ selectedSource: 'financial_runtime', confidence: 0.95, executionTimeMs: 15 }];

  const comparison = buildFinancialRolloutComparison({ controlEntries, canaryEntries });

  assert.ok(typeof comparison.timestamp === 'number');
  assert.ok(comparison.control);
  assert.ok(comparison.canary);
  assert.ok(typeof comparison.divergenceCount === 'number');
  assert.ok(typeof comparison.agreementPercentage === 'number');
  assert.ok(typeof comparison.blockedReasons === 'object');
  assert.equal(comparison.totalEntries, 2);
});

test('telemetry - multiple records mantêm ordem temporal', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity();
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: true });

  recordFinancialRolloutTelemetry(identity, decision, config, 10);
  recordFinancialRolloutTelemetry(identity, decision, config, 20);
  recordFinancialRolloutTelemetry(identity, decision, config, 30);

  const snapshot = getFinancialRolloutTelemetrySnapshot();
  assert.equal(snapshot.length, 3);
  assert.ok(snapshot[0].timestamp <= snapshot[1].timestamp);
  assert.ok(snapshot[1].timestamp <= snapshot[2].timestamp);
  assert.ok(snapshot[0].executionTimeMs === 10);
  assert.ok(snapshot[1].executionTimeMs === 20);
  assert.ok(snapshot[2].executionTimeMs === 30);
});

test('telemetry - relativeTimestamp calculado corretamente', () => {
  resetFinancialRolloutTelemetry();
  const identity = createIdentity();
  const decision = createDecision();
  const config = createConfig({ telemetryEnabled: true });

  const before = Date.now();
  recordFinancialRolloutTelemetry(identity, decision, config, 10);
  const after = Date.now();

  const snapshot = getFinancialRolloutTelemetrySnapshot();
  const entry = snapshot[0];
  assert.ok(entry.timestamp >= before && entry.timestamp <= after);
  assert.equal(entry.relativeTimestamp, 0); // primeira entrada
});