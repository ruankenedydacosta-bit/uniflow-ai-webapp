import assert from 'node:assert/strict';
import test from 'node:test';
import { createStructuredResponse } from './index.js';

test('structured response sempre retorna o contrato completo', () => {
  assert.deepEqual(createStructuredResponse(), {
    facts: {}, plan: {}, emotion: {}, personality: {}, output: {},
  });
});

test('structured response copia e congela os campos sem gerar texto', () => {
  const input = { facts: { balance: 10 }, output: {} };
  const response = createStructuredResponse(input);
  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.facts), true);
  assert.equal('text' in response.output, false);
  assert.notEqual(response.facts, input.facts);
});
