// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutAssignment.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignFinancialRolloutBucket, validateFinancialRolloutAssignment } from './financialRolloutAssignment.js';

test('assignFinancialRolloutBucket - deve retornar controle para canaryPercentage 0', () => {
  const config = {
    enabled: true,
    canaryEnabled: true,
    canaryPercentage: 0,
  };
  const identity = { userId: 'user-123', workspaceId: 'ws-1' };

  const result = assignFinancialRolloutBucket(identity, config);
  assert.equal(result.eligible, false);
  assert.equal(result.cohort, 'control');
  assert.equal(result.deterministic, true);
});

test('assignFinancialRolloutBucket - deve retornar canary para canaryPercentage 100', () => {
  const config = {
    enabled: true,
    canaryEnabled: true,
    canaryPercentage: 100,
  };
  const identity = { userId: 'user-123', workspaceId: 'ws-1' };

  const result = assignFinancialRolloutBucket(identity, config);
  assert.equal(result.eligible, true);
  assert.equal(result.cohort, 'canary');
  assert.equal(result.deterministic, true);
});

test('assignFinancialRolloutBucket - deve retornar controle para usuário sem identidade', () => {
  const config = {
    enabled: true,
    canaryEnabled: true,
    canaryPercentage: 50,
  };

  const result = assignFinancialRolloutBucket(null, config);
  assert.equal(result.eligible, false);
  assert.equal(result.cohort, 'control');
  assert.equal(result.deterministic, true);
});

test('assignFinancialRolloutBucket - deve retornar controle se canaryEnabled false', () => {
  const config = {
    enabled: true,
    canaryEnabled: false,
    canaryPercentage: 50,
  };
  const identity = { userId: 'user-123', workspaceId: 'ws-1' };

  const result = assignFinancialRolloutBucket(identity, config);
  assert.equal(result.eligible, false);
  assert.equal(result.cohort, 'control');
  assert.equal(result.deterministic, true);
});

test('validateFinancialRolloutAssignment - deve validar atribuição válida', () => {
  const assignment = {
    eligible: true,
    bucket: 25,
    cohort: 'canary',
    deterministic: true,
    reasonCodes: [],
  };
  const result = validateFinancialRolloutAssignment(assignment);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateFinancialRolloutAssignment - deve rejeitar atribuição inválida - bucket fora do intervalo', () => {
  const assignment = {
    eligible: true,
    bucket: 150,
    cohort: 'canary',
    deterministic: true,
    reasonCodes: [],
  };
  const result = validateFinancialRolloutAssignment(assignment);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('BUCKET_OUT_OF_RANGE'));
});

test('validateFinancialRolloutAssignment - deve rejeitar atribuição com cohort inválido', () => {
  const assignment = {
    eligible: true,
    bucket: 25,
    cohort: 'invalid',
    deterministic: true,
    reasonCodes: [],
  };
  const result = validateFinancialRolloutAssignment(assignment);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('COHORT_INVALID'));
});