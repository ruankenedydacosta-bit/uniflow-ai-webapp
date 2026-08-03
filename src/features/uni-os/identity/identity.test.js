import assert from 'node:assert/strict';
import test from 'node:test';
import { UNI_OS_IDENTITY } from './index.js';

test('identity expõe fundamento imutável e completo', () => {
  assert.equal(Object.isFrozen(UNI_OS_IDENTITY), true);
  assert.match(UNI_OS_IDENTITY.mission, /clareza/i);
  assert.ok(UNI_OS_IDENTITY.principles.length > 0);
  assert.ok(UNI_OS_IDENTITY.basePersonality.includes('calm'));
  assert.ok(UNI_OS_IDENTITY.values.includes('privacy'));
  assert.ok(UNI_OS_IDENTITY.limits.some((limit) => /confirmation/i.test(limit)));
});
