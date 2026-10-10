// Épico #98 (#100): conferência estática da migration 060 e do config.toml.
// A validação de verdade (triggers, fila, RPCs, grants e cron) rodou em
// transação com ROLLBACK no banco (ver o PR); aqui fica o que não pode
// regredir.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const raiz = new URL('../../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

const nomeDaMigration = readdirSync(new URL('supabase/migrations/', raiz)).find((nome) => /_060_google_calendar_export\.sql$/.test(nome));
const migration = nomeDaMigration ? ler(`supabase/migrations/${nomeDaMigration}`) : '';

test('migration 060 existe depois da 059', () => {
  assert.ok(nomeDaMigration, 'migration 060 ausente');
  assert.ok(BigInt(nomeDaMigration.split('_')[0]) > 20261008230000n);
});

test('fila só para service_role, com RLS ligada', () => {
  assert.match(migration, /alter table public\.calendar_export_queue enable row level security;/);
  assert.match(migration, /revoke all on table public\.calendar_export_queue from anon, authenticated;/);
  assert.doesNotMatch(migration, /grant [^;]* on (table )?public\.calendar_export_queue to authenticated/);
});

test('trigger respeita a importação, o vínculo do Google e o delete antes do cascade', () => {
  assert.match(migration, /current_setting\('uniflow\.agenda_sync_origem', true\)/);
  assert.match(migration, /v_link\.origin = 'provider'/);
  assert.match(migration, /conexao\.status = 'active'/);
  assert.match(migration, /before delete on public\.agenda_items/);
  assert.match(migration, /after insert or update on public\.agenda_items/);
});

test('RPCs do worker e o verificador do segredo só para service_role', () => {
  for (const assinatura of [
    'google_calendar_export_reservar\\(integer\\)',
    'google_calendar_export_concluir\\(bigint, integer, text, timestamptz\\)',
    'google_calendar_export_inicial\\(uuid\\)',
    'verify_google_calendar_dispatch_secret\\(text\\)',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${assinatura} from public, anon, authenticated;`), assinatura);
    assert.match(migration, new RegExp(`grant execute on function public\\.${assinatura} to service_role;`), assinatura);
  }
});

test('cron lê a URL do Vault e não falha a migration sem ela', () => {
  assert.match(migration, /cron\.schedule\(\s*'google-calendar-export',\s*'\* \* \* \* \*'/);
  assert.match(migration, /segredo\.name = 'project_url'/);
  assert.doesNotMatch(migration, /raise exception[^;]*project_url/);
  assert.doesNotMatch(migration, /https:\/\/[a-z0-9]+\.supabase\.co/);
});

test('config.toml: export sem JWT (o segredo do cron autentica)', () => {
  assert.match(ler('supabase/config.toml'), /\[functions\.google-calendar-export\]\nverify_jwt = false/);
  const funcao = ler('supabase/functions/google-calendar-export/index.ts');
  assert.match(funcao, /verify_google_calendar_dispatch_secret/);
  assert.match(funcao, /X-Dispatch-Secret/);
});

test('reserva de 5 minutos, retry respeita a versao e a exportação inicial só pula item do Google', () => {
  assert.match(migration, /bloqueada_ate = now\(\) \+ interval '5 minutes'/);
  assert.match(migration, /set proxima_tentativa_em = p_tentar_de_novo_em,[\s\S]*?where id = p_id and versao = p_versao and concluida_em is null;/);
  assert.match(migration, /and link\.origin = 'provider'\n {4}\)\n {2}on conflict/);
});
