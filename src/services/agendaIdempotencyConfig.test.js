import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AGENDA_IDEMPOTENCY_FLAG_KEY,
  resolveAgendaIdempotencyEnabled,
} from './agendaIdempotencyConfig.js';

test('flag de idempotência nasce OFF e aceita somente true explícito', () => {
  assert.equal(AGENDA_IDEMPOTENCY_FLAG_KEY, 'VITE_AGENDA_IDEMPOTENCY_ENABLED');
  assert.equal(resolveAgendaIdempotencyEnabled(), false);
  assert.equal(resolveAgendaIdempotencyEnabled({}), false);
  assert.equal(resolveAgendaIdempotencyEnabled({ VITE_AGENDA_IDEMPOTENCY_ENABLED: 'false' }), false);
  assert.equal(resolveAgendaIdempotencyEnabled({ VITE_AGENDA_IDEMPOTENCY_ENABLED: 'TRUE' }), false);
  assert.equal(resolveAgendaIdempotencyEnabled({ VITE_AGENDA_IDEMPOTENCY_ENABLED: 'true' }), true);
});

test('.env.example documenta a flag explicitamente OFF', async () => {
  const example = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  assert.match(example, /^VITE_AGENDA_IDEMPOTENCY_ENABLED=false$/m);
});
