// Testes de rollout determinístico (Fase 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRolloutMode,
  resolveShadowRolloutMode,
  isRolloutActive,
  isRolloutBlockedByPolicy,
  isValidRolloutMode,
} from './rolloutEvaluation.js';
import { computeRolloutBucket } from './activationContracts.js';

test('rollout 21: bucket determinístico', () => {
  assert.equal(computeRolloutBucket('user-42'), computeRolloutBucket('user-42'));
  assert.equal(computeRolloutBucket('user-42'), computeRolloutBucket('user-42'));
});

test('rollout 22: mesmo ID mesmo bucket', () => {
  const a = computeRolloutBucket('abc123');
  const b = computeRolloutBucket('abc123');
  assert.equal(a, b);
});

test('rollout 23: IDs diferentes podem ter buckets diferentes', () => {
  const buckets = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => computeRolloutBucket(id)));
  assert.ok(buckets.size > 1, `esperava variedade de buckets, veio ${buckets.size}`);
});

test('rollout 24: sem ID bloqueia percentual', () => {
  const result = resolveRolloutMode({ percent: 50, environment: 'production', identity: null });
  assert.notEqual(result.mode, 'PERCENTAGE');
  assert.equal(computeRolloutBucket(null), null);
});

test('rollout 25: bucket entre 0 e 99', () => {
  for (let i = 0; i < 50; i += 1) {
    const bucket = computeRolloutBucket(`id-${i}`);
    assert.ok(bucket >= 0 && bucket <= 99);
  }
});

test('rollout 26: percent clamp mínimo', () => {
  const result = resolveRolloutMode({ percent: -5, identity: 'u1' });
  assert.equal(result.mode, 'OFF');
});

test('rollout 27: percent clamp máximo (100 bloqueado)', () => {
  const result = resolveRolloutMode({ percent: 100, identity: 'u1' });
  assert.equal(result.mode, 'FULL_ROLLOUT');
  assert.equal(result.blockedByPolicy, true);
  assert.equal(isRolloutBlockedByPolicy('FULL_ROLLOUT'), true);
});

test('rollout 27b: percent acima de 100 também bloqueado', () => {
  const result = resolveRolloutMode({ percent: 130, identity: 'u1' });
  assert.equal(result.mode, 'FULL_ROLLOUT');
  assert.equal(result.blockedByPolicy, true);
});

test('rollout 28: nenhum ID em telemetria', () => {
  const result = resolveRolloutMode({ percent: 30, identity: 'user-secreto-123', environment: 'development' });
  assert.equal(result.bucket, computeRolloutBucket('user-secreto-123'));
  assert.ok(JSON.stringify(result).includes('user-secreto-123') === false);
});

test('rollout: modo SHADOW sempre retorna SHADOW', () => {
  assert.equal(resolveShadowRolloutMode({ shadowMode: true }), 'SHADOW');
  assert.equal(resolveShadowRolloutMode({ shadowMode: true, percent: 100 }), 'SHADOW');
});

test('rollout: test cohort apenas em development', () => {
  const dev = resolveRolloutMode({ percent: 0, environment: 'development', inTestCohort: true });
  assert.equal(dev.mode, 'TEST_USERS');
  const prod = resolveRolloutMode({ percent: 0, environment: 'production', inTestCohort: true });
  assert.equal(prod.mode, 'OFF');
});

test('rollout: development only', () => {
  const dev = resolveRolloutMode({ percent: 0, environment: 'development', developmentOnly: true });
  assert.equal(dev.mode, 'DEVELOPMENT_ONLY');
  const prod = resolveRolloutMode({ percent: 0, environment: 'production', developmentOnly: true });
  assert.equal(prod.mode, 'OFF');
});

test('rollout: manual override', () => {
  const result = resolveRolloutMode({ percent: 0, manualOverride: true });
  assert.equal(result.mode, 'MANUAL_OVERRIDE');
});

test('rollout: percentual inclui apenas bucket < percent', () => {
  const id = 'user-7';
  const bucket = computeRolloutBucket(id);
  const in50 = resolveRolloutMode({ percent: 50, environment: 'production', identity: id });
  const in0 = resolveRolloutMode({ percent: 0, environment: 'production', identity: id });
  assert.equal(in0.mode, 'OFF');
  if (bucket < 50) {
    assert.equal(in50.mode, 'PERCENTAGE');
  } else {
    assert.equal(in50.mode, 'OFF');
  }
});

test('rollout: isRolloutActive e validade de modos', () => {
  assert.equal(isRolloutActive('TEST_USERS'), true);
  assert.equal(isRolloutActive('PERCENTAGE'), true);
  assert.equal(isRolloutActive('DEVELOPMENT_ONLY'), true);
  assert.equal(isRolloutActive('MANUAL_OVERRIDE'), true);
  assert.equal(isRolloutActive('OFF'), false);
  assert.equal(isRolloutActive('SHADOW'), false);
  assert.equal(isRolloutActive('FULL_ROLLOUT'), false);
  assert.equal(isValidRolloutMode('FULL_ROLLOUT'), true);
  assert.equal(isValidRolloutMode('NAO_EXISTE'), false);
});
