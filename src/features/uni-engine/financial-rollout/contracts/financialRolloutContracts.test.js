// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutContracts.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCIAL_ROLLOUT_VERSION,
  FINANCIAL_ROLLOUT_STATUSES,
  isFinancialRolloutStatus,
  FINANCIAL_ROLLOUT_REASON_CODES,
  isFinancialRolloutReasonCode,
} from './financialRolloutContracts.js';

test('contracts - version é string não vazia', () => {
  assert.ok(typeof FINANCIAL_ROLLOUT_VERSION === 'string' && FINANCIAL_ROLLOUT_VERSION.length > 0);
});

test('contracts - FINANCIAL_ROLLOUT_STATUSES é array congelado com valores esperados', () => {
  assert.ok(Array.isArray(FINANCIAL_ROLLOUT_STATUSES));
  assert.ok(FINANCIAL_ROLLOUT_STATUSES.length > 0);
  assert.ok(Object.isFrozen(FINANCIAL_ROLLOUT_STATUSES));
  assert.ok(FINANCIAL_ROLLOUT_STATUSES.includes('rollout_disabled'));
  assert.ok(FINANCIAL_ROLLOUT_STATUSES.includes('shadow_only'));
  assert.ok(FINANCIAL_ROLLOUT_STATUSES.includes('control_group'));
  assert.ok(FINANCIAL_ROLLOUT_STATUSES.includes('canary_eligible'));
  assert.ok(FINANCIAL_ROLLOUT_STATUSES.includes('emergency_rollback'));
  assert.ok(FINANCIAL_ROLLOUT_STATUSES.includes('visible_selected'));
  assert.ok(FINANCIAL_ROLLOUT_STATUSES.includes('legacy_selected'));
});

test('contracts - isFinancialRolloutStatus retorna true para status válidos', () => {
  assert.equal(isFinancialRolloutStatus('rollout_disabled'), true);
  assert.equal(isFinancialRolloutStatus('shadow_only'), true);
  assert.equal(isFinancialRolloutStatus('control_group'), true);
  assert.equal(isFinancialRolloutStatus('canary_eligible'), true);
  assert.equal(isFinancialRolloutStatus('emergency_rollback'), true);
  assert.equal(isFinancialRolloutStatus('visible_selected'), true);
  assert.equal(isFinancialRolloutStatus('legacy_selected'), true);
});

test('contracts - isFinancialRolloutStatus retorna false para status inválidos', () => {
  assert.equal(isFinancialRolloutStatus('invalid_status'), false);
  assert.equal(isFinancialRolloutStatus(''), false);
  assert.equal(isFinancialRolloutStatus(null), false);
  assert.equal(isFinancialRolloutStatus(undefined), false);
  assert.equal(isFinancialRolloutStatus(123), false);
});

test('contracts - FINANCIAL_ROLLOUT_REASON_CODES é array congelado com códigos esperados', () => {
  assert.ok(Array.isArray(FINANCIAL_ROLLOUT_REASON_CODES));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.length > 0);
  assert.ok(Object.isFrozen(FINANCIAL_ROLLOUT_REASON_CODES));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('ROLLUP_DISABLED'));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('ENGINE_DISABLED'));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('RUNTIME_DISABLED'));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('CANARY_INELIGIBLE'));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('BLOCKED_IDENTITY'));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('BLOCKED_CONFIDENCE'));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('EMERGENCY_ROLLBACK'));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('ENABLED_VISIBLE'));
  assert.ok(FINANCIAL_ROLLOUT_REASON_CODES.includes('LEGACY_FALLBACK'));
});

test('contracts - isFinancialRolloutReasonCode retorna true para códigos válidos', () => {
  assert.equal(isFinancialRolloutReasonCode('ROLLUP_DISABLED'), true);
  assert.equal(isFinancialRolloutReasonCode('CANARY_INELIGIBLE'), true);
  assert.equal(isFinancialRolloutReasonCode('BLOCKED_CONFIDENCE'), true);
  assert.equal(isFinancialRolloutReasonCode('EMERGENCY_ROLLBACK'), true);
  assert.equal(isFinancialRolloutReasonCode('ENABLED_VISIBLE'), true);
  assert.equal(isFinancialRolloutReasonCode('LEGACY_FALLBACK'), true);
});

test('contracts - isFinancialRolloutReasonCode retorna false para códigos inválidos', () => {
  assert.equal(isFinancialRolloutReasonCode('INVALID_CODE'), false);
  assert.equal(isFinancialRolloutReasonCode(''), false);
  assert.equal(isFinancialRolloutReasonCode(null), false);
  assert.equal(isFinancialRolloutReasonCode(undefined), false);
  assert.equal(isFinancialRolloutReasonCode(123), false);
});

test('contracts - arrays não podem ser modificados (congelados)', () => {
  assert.throws(() => {
    FINANCIAL_ROLLOUT_STATUSES.push('new_status');
  });
  assert.throws(() => {
    FINANCIAL_ROLLOUT_REASON_CODES.push('NEW_CODE');
  });
});

test('contracts - todos os status são strings únicas', () => {
  const unique = new Set(FINANCIAL_ROLLOUT_STATUSES);
  assert.equal(unique.size, FINANCIAL_ROLLOUT_STATUSES.length);
  for (const status of FINANCIAL_ROLLOUT_STATUSES) {
    assert.ok(typeof status === 'string');
  }
});

test('contracts - todos os reason codes são strings únicas', () => {
  const unique = new Set(FINANCIAL_ROLLOUT_REASON_CODES);
  assert.equal(unique.size, FINANCIAL_ROLLOUT_REASON_CODES.length);
  for (const code of FINANCIAL_ROLLOUT_REASON_CODES) {
    assert.ok(typeof code === 'string');
  }
});