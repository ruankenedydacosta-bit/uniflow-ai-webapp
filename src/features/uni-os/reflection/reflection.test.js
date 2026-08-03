import assert from 'node:assert/strict';
import test from 'node:test';
import { reflectOnPlan } from './index.js';

test('reflection detecta sinais e confirmação sem alterar o plano', () => {
  const plan = Object.freeze({ steps: Object.freeze(['review']), requiresConfirmation: true });
  const before = structuredClone(plan);
  const result = reflectOnPlan(plan, { ambiguities: ['account'], risks: ['cash'], confirmed: false });
  assert.equal(result.plan, plan);
  assert.equal(result.confirmationPending, true);
  assert.equal(result.valid, false);
  assert.equal(result.changedPlan, false);
  assert.deepEqual(plan, before);
});

test('reflection aceita plano sem conflitos', () => {
  assert.equal(reflectOnPlan({ requiresConfirmation: false }).valid, true);
});
