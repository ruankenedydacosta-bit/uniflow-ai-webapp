import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlan } from './index.js';

test('planning gera passos estruturados sem execução', () => {
  const plan = createPlan({ attention: { type: 'financial_action' }, intent: { intent: 'register_expense' } });
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.executesAction, false);
  assert.equal(Object.isFrozen(plan.steps), true);
});

test('planning usa explicação como fallback seguro', () => {
  const plan = createPlan({ attention: { type: 'unknown' } });
  assert.equal(plan.attentionType, 'unknown');
  assert.match(plan.steps[0], /concept/i);
});
