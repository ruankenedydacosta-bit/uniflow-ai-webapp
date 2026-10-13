// Épico #98 (#101): conferência estática da migration 073, do config.toml e
// de sincronizarAgora. A validação de verdade das RPCs rodou em transação
// desfeita no banco (ver o PR); aqui fica o que não pode regredir.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createGoogleCalendarService } from './googleCalendarService.js';

const raiz = new URL('../../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

const nomes = readdirSync(new URL('supabase/migrations/', raiz));
const nomeDaMigration = nomes.find((nome) => /_073_google_calendar_importacao\.sql$/.test(nome));
const nomeDaExportacao = nomes.find((nome) => /_060_google_calendar_export\.sql$/.test(nome));
const migration = nomeDaMigration ? ler(`supabase/migrations/${nomeDaMigration}`) : '';

test('migration 073 existe e vem depois da exportação (060)', () => {
  assert.ok(nomeDaMigration, 'migration 073 ausente');
  assert.ok(BigInt(nomeDaMigration.split('_')[0]) > BigInt(nomeDaExportacao.split('_')[0]));
});

test('não altera as tabelas do #99 nem usa upsert na chave da conexão', () => {
  assert.doesNotMatch(migration, /alter table/i);
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /on conflict/i);
});

test('aplicar e varrer ligam a variável anti-loop do #100', () => {
  const ligacoes = migration.match(/set_config\('uniflow\.agenda_sync_origem', 'google', true\)/g) ?? [];
  assert.equal(ligacoes.length, 2);
});

test('só conexão ativa, com o dono ainda no espaço e com permissão de criar', () => {
  assert.match(migration, /conexao\.status = 'active'/);
  assert.match(migration, /membro\.status = 'active'\n\s+and membro\.role in \('owner', 'admin', 'member'\)/);
  assert.match(migration, /created_by\n\s+\)[\s\S]*?v_conexao\.user_id\n\s+\)/);
});

test('atualizar e cancelar só gravam se o item não mudou desde a leitura', () => {
  const guardas = migration.match(/and item\.updated_at = \(v_op->>'esperado_updated_at'\)::timestamptz/g) ?? [];
  assert.equal(guardas.length, 2);
});

test('varredura só cancela item vindo do Google, sem apagar nada', () => {
  assert.match(migration, /link\.origin = 'provider'/);
  assert.match(migration, /set status = 'cancelled'\n\s+from public\.agenda_item_links/);
  assert.doesNotMatch(migration, /delete from public\.agenda_items/);
});

test('RPCs só para service_role', () => {
  for (const assinatura of [
    'google_calendar_sync_travar\\(uuid, integer\\)',
    'google_calendar_import_estado\\(uuid, text, text\\[\\]\\)',
    'google_calendar_import_aplicar\\(uuid, text, jsonb\\)',
    'google_calendar_import_varrer\\(uuid, text, timestamptz, timestamptz, timestamptz\\)',
    'google_calendar_sync_candidatas\\(integer\\)',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${assinatura} from public, anon, authenticated;`), assinatura);
    assert.match(migration, new RegExp(`grant execute on function public\\.${assinatura} to service_role;`), assinatura);
  }
  assert.match(migration, /revoke all on function private\.google_calendar_conexao_importavel\(uuid\) from public, anon, authenticated;/);
});

test('cron usa o segredo da 060 e a URL do Vault, sem o ref do projeto', () => {
  assert.match(migration, /cron\.schedule\(\s*'google-calendar-sync-dispatch',\s*'\*\/10 \* \* \* \*'/);
  assert.match(migration, /private\.google_calendar_dispatch_secret/);
  assert.match(migration, /segredo\.name = 'project_url'/);
  assert.doesNotMatch(migration, /raise exception[^;]*project_url/);
  assert.doesNotMatch(migration, /supabase\.co/);
  assert.doesNotMatch(migration, /egbqrhcfxtjqwgteaknp/);
});

test('config.toml: webhook e sync-dispatch sem JWT, sync-now com JWT', () => {
  const config = ler('supabase/config.toml');
  assert.match(config, /\[functions\.google-calendar-webhook\]\nverify_jwt = false/);
  assert.match(config, /\[functions\.google-calendar-sync-dispatch\]\nverify_jwt = false/);
  assert.match(config, /\[functions\.google-calendar-sync-now\]\nverify_jwt = true/);
  assert.match(ler('supabase/functions/google-calendar-sync-dispatch/index.ts'), /verify_google_calendar_dispatch_secret/);
  assert.match(ler('supabase/functions/google-calendar-webhook/index.ts'), /mesmoToken\(linha\.channel_token, channelToken\)/);
});

test('sincronizarAgora chama google-calendar-sync-now só com workspace_id', async () => {
  let pedido;
  const service = createGoogleCalendarService({
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    fetchImpl: async (url, init) => {
      pedido = { url, init };
      return { ok: true, status: 200, json: async () => ({ sincronizado_em: '2026-10-13T12:00:00Z', calendarios: [] }) };
    },
  });
  const { data, error } = await service.sincronizarAgora({ workspaceId: 'ws-1' });
  assert.equal(error, null);
  assert.equal(data.sincronizado_em, '2026-10-13T12:00:00Z');
  assert.equal(pedido.url, 'https://demo.supabase.co/functions/v1/google-calendar-sync-now');
  assert.deepEqual(JSON.parse(pedido.init.body), { workspace_id: 'ws-1' });
  assert.equal((await service.sincronizarAgora({})).error.code, 'INVALID_WORKSPACE');
});

test('sincronizarAgora devolve o código de erro da função sem lançar', async () => {
  const service = createGoogleCalendarService({
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ error: { code: 'RECONNECT_REQUIRED', message: 'x' } }) }),
  });
  const { data, error } = await service.sincronizarAgora({ workspaceId: 'ws-1' });
  assert.equal(data, null);
  assert.equal(error.code, 'RECONNECT_REQUIRED');
});
