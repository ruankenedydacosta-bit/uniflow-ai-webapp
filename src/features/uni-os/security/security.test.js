import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSecurity } from './index.js';

test('security não inventa verificação quando nenhuma foi fornecida', () => {
  assert.deepEqual(evaluateSecurity(), {
    status: 'not_evaluated', usesExistingChecksOnly: true, failedChecks: [],
  });
});

test('security apenas agrega bloqueios existentes', () => {
  const result = evaluateSecurity({ checks: [{ id: 'existing', passed: false }] });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.failedChecks, ['existing']);
});
