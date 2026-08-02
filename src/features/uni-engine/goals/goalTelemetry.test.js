// Testes de telemetria redigida do Goal Engine (Fase 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUserMessage } from '../normalizeUserMessage.js';
import { runGoalEngine } from './runGoalEngine.js';
import {
  GOAL_TELEMETRY_ALLOWED_FIELDS,
  redactGoalTelemetry,
} from './telemetry/redactGoalTelemetry.js';
import {
  buildGoalTelemetry,
  emitGoalTelemetry,
} from './telemetry/goalTelemetry.js';

function input(text, overrides = {}) {
  return {
    normalizedMessage: normalizeUserMessage(text),
    classification: { primaryIntent: 'create_goal' },
    cognitiveContext: { turnCount: 2 },
    persistentMemory: { retrieved: [{ id: 'm1' }] },
    financialSnapshot: { hasData: true, totalBalance: 740.5, referenceDate: '2026-07-30' },
    session: { workspaceId: 'workspace-1', workspaceType: 'personal' },
    userPreferences: { workspaceType: 'personal' },
    timestamp: '2026-08-01T00:00:00.000Z',
    featureFlags: { goalsEnabled: true, goalsShadowMode: true, goalsTelemetryEnabled: true },
    ...overrides,
  };
}

test('telemetria: registra somente dados estruturais do objetivo', () => {
  const received = [];
  const result = runGoalEngine(input('Quero juntar R$ 10.000 em 12 meses para a viagem dos sonhos', {
    telemetryAdapter: (entry) => received.push(entry),
  }));
  assert.equal(received.length, 1);
  const entry = received[0];
  assert.equal(entry.enabled, true);
  assert.equal(entry.shadowMode, true);
  assert.equal(entry.appliedToDecision, false);
  assert.equal(entry.goalDetected, true);
  assert.equal(entry.type, 'SAVINGS');
  assert.equal(entry.status, 'NEEDS_INFORMATION');
  assert.equal(entry.horizon, 'MEDIUM_TERM');
  assert.equal(entry.confidenceBand, 'very_high');
  assert.equal(entry.feasibility, 'PARTIALLY_FEASIBLE');
  assert.equal(entry.progressBand, 'early');
  assert.equal(entry.dependenciesCount, 4);
  assert.equal(entry.conflictsCount, 0);
  assert.ok(typeof entry.risksCount === 'number');
  assert.ok(typeof entry.missingInformationCount === 'number');
  assert.ok(typeof entry.latencyMs === 'number');
  assert.equal(result.telemetry, entry);
});

test('telemetria: nunca registra conteúdo livre, valores brutos ou IDs', () => {
  const received = [];
  runGoalEngine(input('Quero juntar R$ 10.000 em 12 meses para a viagem dos sonhos', {
    telemetryAdapter: (entry) => received.push(entry),
  }));
  const serialized = JSON.stringify(received[0]);
  assert.equal(serialized.includes('viagem'), false, 'descrição livre nunca sai');
  assert.equal(serialized.includes('10.000'), false, 'valor bruto nunca sai');
  assert.equal(serialized.includes('10000'), false);
  assert.equal(serialized.includes('740'), false, 'saldo bruto nunca sai');
  assert.equal(serialized.includes('user-1'), false, 'ID de usuário nunca sai');
  assert.equal(serialized.includes('workspace-1'), false, 'ID de workspace nunca sai');
  assert.equal(serialized.includes('m1'), false, 'IDs de memória nunca saem');
  assert.equal(serialized.includes('quero'), false, 'mensagem original nunca sai');
});

test('telemetria: sem detecção registra somente o estado vazio', () => {
  const received = [];
  runGoalEngine(input('Olá, tudo bem?', {
    telemetryAdapter: (entry) => received.push(entry),
  }));
  assert.equal(received.length, 1);
  assert.equal(received[0].goalDetected, false);
  assert.equal(received[0].type, 'UNKNOWN');
});

test('telemetria: redação filtra qualquer campo fora da allowlist', () => {
  const redacted = redactGoalTelemetry({
    correlationId: 'ue_x',
    rawMessage: 'Quero juntar 10 mil',
    userName: 'João',
    email: 'joao@exemplo.com',
    accountNames: ['Nubank', 'Itaú'],
    targetAmount: 10000,
  });
  const keys = Object.keys(redacted);
  for (const key of keys) {
    assert.ok(GOAL_TELEMETRY_ALLOWED_FIELDS.includes(key), `campo não permitido: ${key}`);
  }
  assert.equal(redacted.rawMessage, undefined);
  assert.equal(redacted.userName, undefined);
  assert.equal(redacted.email, undefined);
  assert.equal(redacted.accountNames, undefined);
  assert.equal(redacted.targetAmount, undefined);
});

test('telemetria: telemetria desligada não emite nada', () => {
  const received = [];
  const result = runGoalEngine(input('Quero juntar 10 mil', {
    featureFlags: { goalsEnabled: true, goalsShadowMode: true, goalsTelemetryEnabled: false },
    telemetryAdapter: (entry) => received.push(entry),
  }));
  assert.equal(received.length, 0);
  assert.ok(result.telemetry == null, 'sem telemetria o campo fica ausente/nulo');
});

test('telemetria: adapter com falha nunca interrompe o engine', () => {
  const result = runGoalEngine(input('Quero juntar 10 mil', {
    telemetryAdapter: () => {
      throw new Error('adapter quebrado');
    },
  }));
  assert.ok(result);
  assert.equal(result.goalDetected, true);
});

test('telemetria: buildGoalTelemetry produz entrada redigida e serializável', () => {
  const result = runGoalEngine(input('Quero juntar R$ 10.000 em 12 meses'));
  const telemetry = buildGoalTelemetry({
    correlationId: 'ue_trace',
    engineVersion: '2.0',
    enabled: true,
    shadowMode: true,
    flagGoalsEnabled: true,
    flagGoalsShadow: true,
    flagGoalsTelemetry: true,
    result,
  });
  assert.doesNotThrow(() => JSON.stringify(telemetry));
  const emitted = emitGoalTelemetry(telemetry, null);
  assert.deepEqual(emitted, telemetry);
});
