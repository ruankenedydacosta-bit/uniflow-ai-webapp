import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rollout = () => readFile(
  new URL('../../docs/01-arquitetura/AGENDA_IDEMPOTENCY_ROLLOUT.md', import.meta.url),
  'utf8',
);

test('rollout exige migration aplicada e validada antes do frontend novo', async () => {
  const content = await rollout();
  const migration = content.indexOf('aplicar `supabase/migrations/20260808003000_030_agenda_item_idempotency.sql`');
  const validation = content.indexOf('validar a coluna UUID');
  const frontend = content.indexOf('somente depois liberar o frontend/backend');

  assert.ok(migration >= 0);
  assert.ok(validation > migration);
  assert.ok(frontend > validation);
  assert.match(content, /código novo não deve ser promovido/);
});
