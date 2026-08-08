import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rollout = () => readFile(
  new URL('../../docs/01-arquitetura/AGENDA_IDEMPOTENCY_ROLLOUT.md', import.meta.url),
  'utf8',
);

test('rollout exige deploy OFF, migration validada e só então ativação B.2', async () => {
  const content = await rollout();
  const deployOff = content.indexOf('implantar o frontend/backend compatível com a flag OFF');
  const migration = content.indexOf('aplicar `supabase/migrations/20260808003000_030_agenda_item_idempotency.sql`');
  const validation = content.indexOf('validar a coluna UUID');
  const enable = content.indexOf('somente depois habilitar `VITE_AGENDA_IDEMPOTENCY_ENABLED=true`');

  assert.ok(deployOff >= 0);
  assert.ok(migration > deployOff);
  assert.ok(validation > migration);
  assert.ok(enable > validation);
  assert.match(content, /flag deve permanecer OFF/);
  assert.match(content, /nenhuma consulta ou escrita referencia `agenda_items\.client_operation_id`/);
});
