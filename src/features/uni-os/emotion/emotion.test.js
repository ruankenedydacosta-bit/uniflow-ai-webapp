import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEmotionTone } from './index.js';

test('emotion usa alerta calmo para emergência sem alterar fatos', () => {
  const result = resolveEmotionTone({ attention: { type: 'emergency' } });
  assert.equal(result.tone, 'alert');
  assert.equal(result.changesFacts, false);
});

test('emotion usa educação para explicação', () => {
  assert.equal(resolveEmotionTone({ attention: { type: 'explanation' } }).tone, 'educational');
});
