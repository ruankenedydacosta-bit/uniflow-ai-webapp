import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20261010150000_062_admin_plano_aponta_espaco_atual.sql', import.meta.url),
  'utf8',
);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, name);
  const end = sql.indexOf('$$;', sql.indexOf('as $$', start));
  return sql.slice(start, end);
}

test('migration é atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('plano manual aponta o espaço atual do perfil sem sobrescrever outro', async () => {
  const grant = functionBody(await migration(), 'admin_grant_manual_plan');
  const beginIndex = grant.indexOf('\nbegin\n');
  assert.match(grant.slice(beginIndex + 7).trim().split('\n')[0], /platform_admin_require\(\)/);
  assert.match(
    grant,
    /update public\.profiles\s+set current_workspace_id = v_workspace_id\s+where id = p_user_id\s+and current_workspace_id is null;/,
  );
  assert.ok(
    grant.indexOf('update public.profiles') > grant.indexOf('insert into public.workspaces'),
    'o update vem depois de criar o espaço',
  );
});

test('backfill só preenche perfil sem espaço atual, com espaço de que é membro ativo', async () => {
  const sql = await migration();
  const backfill = sql.slice(sql.lastIndexOf('update public.profiles as profile'));
  assert.match(backfill, /where profile\.current_workspace_id is null/);
  assert.match(backfill, /member\.status = 'active'/);
  assert.match(backfill, /order by \(workspace\.workspace_type = 'personal'\) desc, workspace\.created_at/);
});
