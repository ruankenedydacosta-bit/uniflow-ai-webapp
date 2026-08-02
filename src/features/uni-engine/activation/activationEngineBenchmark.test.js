// Testes de orquestração, erro interno e benchmark do Activation Engine (Fase 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runActivationEngine, validateActivationEngineOutput } from './runActivationEngine.js';
import { ACTIVATION_POLICY } from './activationPolicy.js';

const BASE = {
  capability: 'QUESTION_GUIDANCE',
  engineEnabled: true,
  activationEnabled: true,
  capabilityEnabled: true,
  environment: 'development',
  shadowMode: false,
  confidence: 0.9,
  risk: 'NONE',
  workspaceType: 'personal',
  dataSufficient: true,
  userId: 'tester-1',
  testUserIds: ['tester-1'],
  rolloutPercent: 0,
  requested: true,
  suggested: { questionKey: 'category', fieldsStillMissing: ['category'] },
  legacy: { effect: 'none' },
  telemetryEnabled: false,
};

test('engine 108: saída é serializável e validável', () => {
  const decision = runActivationEngine(BASE);
  assert.doesNotThrow(() => JSON.stringify(decision));
  const validation = validateActivationEngineOutput(decision);
  assert.equal(validation.valid, true);
});

test('engine 109: engine off retorna DISABLED com fallback', () => {
  const decision = runActivationEngine({ ...BASE, engineEnabled: false });
  assert.equal(decision.activationStatus, 'DISABLED');
  assert.equal(decision.fallbackUsed, true);
  assert.equal(decision.fallbackReason, 'ENGINE_DISABLED');
  assert.equal(decision.applied, false);
});

test('engine 110: engine off não itera capacidades nem falha', () => {
  const decision = runActivationEngine({ ...BASE, engineEnabled: false });
  assert.equal(decision.gates.length, 1);
  assert.equal(decision.gates[0].name, 'ENGINE_ENABLED');
  assert.doesNotThrow(() => JSON.stringify(decision));
});

test('engine 111: activation off retorna BLOCKED_BY_FLAG', () => {
  const decision = runActivationEngine({ ...BASE, activationEnabled: false });
  assert.equal(decision.activationStatus, 'BLOCKED_BY_FLAG');
  assert.equal(decision.fallbackUsed, true);
});

test('engine 112: fallback é sem efeito aplicado', () => {
  for (const overrides of [
    { engineEnabled: false },
    { activationEnabled: false },
    { capabilityEnabled: false },
    { environment: 'production' },
    { confidence: 0.1 },
    { risk: 'CRITICAL' },
    { dataSufficient: false },
  ]) {
    const decision = runActivationEngine({ ...BASE, ...overrides });
    assert.equal(decision.applied, false, `falha em ${JSON.stringify(overrides)}`);
    assert.equal(decision.fallbackUsed, true);
    assert.equal(decision.appliedEffect, null);
  }
});

test('engine 113: erro interno cai em ERROR_SAFE', () => {
  const decision = runActivationEngine({
    ...BASE,
    telemetryEnabled: true,
    get telemetryAdapter() {
      throw new Error('boom');
    },
  });
  assert.equal(decision.activationStatus, 'ERROR_SAFE');
  assert.equal(decision.fallbackUsed, true);
  assert.equal(decision.fallbackReason, 'ACTIVATION_INTERNAL_ERROR');
  assert.equal(decision.applied, false);
});

test('engine 114: ERROR_SAFE mantém o contrato seguro', () => {
  const decision = runActivationEngine({
    ...BASE,
    get telemetryAdapter() {
      throw new Error('boom');
    },
  });
  assert.equal(decision.shadow.executed, false);
  assert.equal(decision.shadow.memoryModified, false);
  assert.equal(decision.shadow.voiceTouched, false);
  const validation = validateActivationEngineOutput(decision);
  assert.equal(validation.valid, true);
});

test('engine 115: gatilho de erro nunca vaza para o pipeline', () => {
  const decision = runActivationEngine({
    ...BASE,
    get suggested() {
      throw new Error('getter boom');
    },
  });
  assert.equal(decision.activationStatus, 'ERROR_SAFE');
  assert.equal(decision.fallbackUsed, true);
});

test('engine 116: latencyMs é número finito', () => {
  const decision = runActivationEngine(BASE);
  assert.equal(typeof decision.latencyMs, 'number');
  assert.ok(Number.isFinite(decision.latencyMs));
});

test('benchmark 117: p95 dentro da meta de política', () => {
  const samples = [];
  for (let i = 0; i < 200; i += 1) {
    const decision = runActivationEngine(BASE);
    samples.push(decision.latencyMs);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  assert.ok(p95 <= ACTIVATION_POLICY.latencyTargets.p95Ms, `p95=${p95}ms acima da meta ${ACTIVATION_POLICY.latencyTargets.p95Ms}ms`);
});

test('benchmark: mediana abaixo da meta', () => {
  const samples = [];
  for (let i = 0; i < 100; i += 1) {
    samples.push(runActivationEngine(BASE).latencyMs);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(median <= ACTIVATION_POLICY.latencyTargets.medianMs, `mediana=${median}ms acima da meta ${ACTIVATION_POLICY.latencyTargets.medianMs}ms`);
});

test('engine: entrada nula ou inválida não lança', () => {
  assert.doesNotThrow(() => runActivationEngine());
  assert.doesNotThrow(() => runActivationEngine(null));
  assert.doesNotThrow(() => runActivationEngine('texto'));
  const decision = runActivationEngine(null);
  assert.equal(decision.activationStatus, 'DISABLED');
});
