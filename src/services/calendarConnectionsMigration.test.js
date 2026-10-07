// Épico #98 (#99): conferência estática da migration 055, das Edge Functions
// google-calendar-* e do config.toml. A validação de RLS de verdade roda em
// transação com ROLLBACK (ver o PR); aqui fica o que não pode regredir.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const raiz = new URL('../../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

const nomeDaMigration = readdirSync(new URL('supabase/migrations/', raiz)).find((nome) => /_055_calendar_connections\.sql$/.test(nome));
const migration = nomeDaMigration ? ler(`supabase/migrations/${nomeDaMigration}`) : '';

const FUNCOES = ['google-calendar-connect', 'google-calendar-oauth-callback', 'google-calendar-confirm', 'google-calendar-disconnect'];
const COMPARTILHADOS = ['api.ts', 'banco.ts', 'calendarios.ts', 'tokens.ts', 'pendencias.ts', 'escopos.js', 'oauth.js', 'listaDeCalendarios.js', 'confirmacao.js'];

test('migration 055 existe com versão de 14 dígitos depois da 054', () => {
  assert.ok(nomeDaMigration, 'migration 055 ausente');
  const versao = nomeDaMigration.split('_')[0];
  assert.match(versao, /^\d{14}$/);
  assert.ok(BigInt(versao) > 20261007101852n);
});

test('cria as quatro tabelas com RLS ligada', () => {
  for (const tabela of ['calendar_connections', 'calendar_connection_calendars', 'agenda_item_links', 'calendar_oauth_states']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${tabela} \\(`), tabela);
    assert.match(migration, new RegExp(`alter table public\\.${tabela} enable row level security;`), tabela);
    assert.match(migration, new RegExp(`revoke all on table public\\.${tabela} from anon, authenticated;`), tabela);
  }
});

test('traz as colunas que #100 e #101 usam', () => {
  for (const coluna of [
    'exportacao_inicial_em', 'sync_window_start', 'sync_window_end', 'last_full_sync_at',
    'sync_lock_until', 'last_sync_error', 'remote_seen_at', 'channel_token', 'channel_expires_at',
  ]) {
    assert.match(migration, new RegExp(`\\b${coluna}\\b`), coluna);
  }
});

test('uniques e checks do contrato', () => {
  assert.match(migration, /unique \(user_id, workspace_id, provider\)/);
  assert.match(migration, /unique \(connection_id, external_calendar_id\)/);
  assert.match(migration, /unique \(agenda_item_id, provider\)/);
  assert.match(migration, /unique \(workspace_id, provider, calendar_id, external_id\)/);
  assert.match(migration, /last_error_code in \('token_revogado', 'escopo_insuficiente', 'destino_ausente'\)/);
  // 'pending': o callback grava, a google-calendar-confirm ativa (#99).
  assert.match(migration, /status in \('pending', 'active', 'error'\)/);
  assert.match(migration, /status <> 'pending'\s+or \(confirmation_hash is not null and confirmation_expires_at is not null\)/);
  assert.match(migration, /on public\.calendar_connections \(confirmation_hash\)\s+where confirmation_hash is not null/);
  assert.match(migration, /origin in \('app', 'provider'\)/);
  assert.match(migration, /on public\.calendar_connection_calendars \(channel_id\)\s+where channel_id is not null/);
});

function grantDeSelect(tabela) {
  const casamento = migration.match(new RegExp(`grant select \\(([^)]*)\\) on public\\.${tabela} to authenticated;`));
  assert.ok(casamento, `grant de select por coluna ausente em ${tabela}`);
  return casamento[1].split(',').map((coluna) => coluna.trim());
}

test('client nunca lê o id do segredo nem o estado interno do sync', () => {
  const conexoes = grantDeSelect('calendar_connections');
  for (const coluna of ['refresh_token_secret_id', 'confirmation_hash', 'confirmation_expires_at']) {
    assert.ok(!conexoes.includes(coluna), coluna);
  }
  const calendarios = grantDeSelect('calendar_connection_calendars');
  for (const coluna of ['sync_token', 'channel_id', 'channel_resource_id', 'channel_token', 'sync_lock_until']) {
    assert.ok(!calendarios.includes(coluna), coluna);
  }
  assert.match(migration, /grant update \(destination_calendar_id\) on public\.calendar_connections to authenticated;/);
  assert.match(migration, /grant update \(is_read\) on public\.calendar_connection_calendars to authenticated;/);
  assert.doesNotMatch(migration, /grant (insert|delete|all)[^;]*to authenticated/);
  assert.doesNotMatch(migration, /calendar_oauth_states to authenticated/);
});

test('RPCs do Vault só para service_role, e o delete da conexão apaga o segredo', () => {
  for (const assinatura of ['calendar_connection_set_refresh_token(uuid, text)', 'calendar_connection_get_refresh_token(uuid)']) {
    const escapada = assinatura.replace(/[()]/g, '\\$&');
    assert.match(migration, new RegExp(`revoke execute on function public\\.${escapada} from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escapada} to service_role;`));
  }
  assert.match(migration, /vault\.create_secret\(/);
  assert.match(migration, /after delete on public\.calendar_connections/);
  assert.match(migration, /delete from vault\.secrets where id = old\.refresh_token_secret_id/);
});

test('triggers de destino próprio e de leitura só de calendário próprio', () => {
  assert.match(migration, /calendar\.access_role = 'owner'/);
  assert.match(migration, /if new\.is_read and new\.access_role <> 'owner' then/);
  assert.match(migration, /user_id, workspace_id e provider são imutáveis/);
});

test('nenhum project-ref nem URL de projeto Supabase em migration, função ou config', () => {
  const fontes = [
    migration,
    ...FUNCOES.map((funcao) => ler(`supabase/functions/${funcao}/index.ts`)),
    ...COMPARTILHADOS.map((arquivo) => ler(`supabase/functions/_shared/googleCalendar/${arquivo}`)),
  ];
  for (const fonte of fontes) {
    assert.doesNotMatch(fonte, /egbqrhcfxtjqwgteaknp|[a-z]{20}\.supabase\.co/);
  }
});

test('config.toml: connect, confirm e disconnect com JWT, callback sem', () => {
  const config = ler('supabase/config.toml');
  assert.match(config, /\[functions\.google-calendar-confirm\]\nverify_jwt = true/);
  assert.match(config, /\[functions\.google-calendar-connect\]\nverify_jwt = true/);
  assert.match(config, /\[functions\.google-calendar-oauth-callback\]\nverify_jwt = false/);
  assert.match(config, /\[functions\.google-calendar-disconnect\]\nverify_jwt = true/);
});

test('nenhum token vai para log nem para a resposta das funções', () => {
  for (const arquivo of [
    ...FUNCOES.map((funcao) => `supabase/functions/${funcao}/index.ts`),
    ...['tokens.ts', 'calendarios.ts', 'api.ts', 'banco.ts'].map((nome) => `supabase/functions/_shared/googleCalendar/${nome}`),
  ]) {
    const fonte = ler(arquivo);
    for (const linha of fonte.split('\n').filter((l) => /console\.(log|error|warn|info)/.test(l))) {
      // A mensagem fixa pode citar "token"; os argumentos, não.
      const argumentos = linha.replace(/'[^']*'/g, "''");
      assert.doesNotMatch(argumentos, /token|refresh|secret|verifier|corpo\b|json\b/i, `${arquivo}: ${linha.trim()}`);
    }
    assert.doesNotMatch(fonte, /jsonResponse\([^)]*(refresh_token|access_token|accessToken|refreshToken)/);
  }
});

test('callback consome o state uma vez só (DELETE ... RETURNING) e guarda só o hash', () => {
  const callback = ler('supabase/functions/google-calendar-oauth-callback/index.ts');
  assert.match(callback, /metodo: 'DELETE',\s*\n\s*caminho: '\/rest\/v1\/calendar_oauth_states'/);
  assert.match(callback, /prefer: 'return=representation'/);
  assert.match(callback, /state_hash: `eq\.\$\{await hashDoState\(state\)\}`/);
  assert.match(callback, /expires_at: `gt\./);
  const connect = ler('supabase/functions/google-calendar-connect/index.ts');
  assert.match(connect, /state_hash: stateHash/);
  assert.doesNotMatch(connect, /\bstate: state\b|state_hash: state\b/);
});

test('connect e callback checam a allowlist GOOGLE_CALENDAR_ALLOWED_USER_IDS', () => {
  for (const funcao of ['google-calendar-connect', 'google-calendar-oauth-callback']) {
    assert.match(ler(`supabase/functions/${funcao}/index.ts`), /usuarioNaAllowlist\([^)]*GOOGLE_CALENDAR_ALLOWED_USER_IDS/);
  }
});

test('disconnect só revoga sem outra conexão ativa com o mesmo e-mail', () => {
  const disconnect = ler('supabase/functions/google-calendar-disconnect/index.ts');
  assert.match(disconnect, /account_email: `eq\./);
  assert.match(disconnect, /status: 'eq\.active'/);
  assert.match(disconnect, /if \(!haOutraConexao && conexao\.account_email\)/);
  assert.match(disconnect, /\/channels\/stop/);
});

test('callback nunca ativa a conexão: grava pendente; quem ativa é a confirm', () => {
  const callback = ler('supabase/functions/google-calendar-oauth-callback/index.ts');
  assert.match(callback, /status: 'pending',/);
  assert.match(callback, /confirmation_hash: await hashDoState\(pendente\)/);
  assert.doesNotMatch(callback, /status: 'active'/);
  assert.doesNotMatch(callback, /POST',\s*\n\s*caminho: '\/calendars'/);
  assert.match(callback, /revogarSeNinguemMaisUsa\(config, \{\s*\n\s*token: tokenDaContaAnterior/);

  const confirm = ler('supabase/functions/google-calendar-confirm/index.ts');
  const consumo = confirm.indexOf("corpo: { status: 'error', confirmation_hash: null, confirmation_expires_at: null }");
  const ativacao = confirm.indexOf("status: 'active', last_error_code: null");
  assert.ok(consumo > 0 && ativacao > 0);
  assert.match(confirm, /user_id: `eq\.\$\{userId\}`,\s*\n\s*status: 'eq\.pending',/);
  assert.match(confirm, /calendar_id: `not\.in\.\$\{listaParaFiltroIn\(calendariosDaConta\)\}`/);
  assert.match(confirm, /acharCalendarioDoEspaco\(lista\.itens, workspaceId\)/);
});

test('disconnect apaga a conexão antes de revogar no Google', () => {
  const disconnect = ler('supabase/functions/google-calendar-disconnect/index.ts');
  const remocao = disconnect.indexOf("metodo: 'DELETE',\n    caminho: '/rest/v1/calendar_connections'");
  const revogacao = disconnect.indexOf('await revogarTokenNoGoogle(refreshToken)');
  assert.ok(remocao > 0 && revogacao > remocao);
});

test('client não vê conexão pendente, nem a própria', () => {
  assert.match(migration, /using \(user_id = \(select auth\.uid\(\)\) and status <> 'pending'\);/);
  assert.equal((migration.match(/and connection\.status <> 'pending'/g) ?? []).length, 3);
});
