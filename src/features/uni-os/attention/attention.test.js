import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAttention, createAttentionResult } from './index.js';

test('attention classifica ações e perguntas financeiras', () => {
  assert.equal(classifyAttention({ intent: 'register_expense' }), 'financial_action');
  assert.equal(classifyAttention({ intent: 'forecast' }), 'financial_question');
});

test('attention prioriza emergência explícita', () => {
  assert.equal(classifyAttention({ intent: 'question', emergency: true }), 'emergency');
});

test('attention nunca executa a intenção', () => {
  const intent = Object.freeze({ intent: 'register_income', amount: 100 });
  const result = createAttentionResult(intent);
  assert.equal(result.executesAction, false);
  assert.equal(intent.amount, 100);
});
