import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20261006185456_050_voice_minutes.sql', import.meta.url),
  'utf8',
);

// Épico #116 / #113: cota de minutos de voz por reserva de bloco. O
// comportamento roda em supabase/tests/voice_minutes_validation.sql; aqui
// fica a estrutura que não pode regredir sem alguém perceber.

test('migration é atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('tabelas sem acesso direto do app: RLS ligada e nenhum grant', async () => {
  const sql = await migration();
  for (const table of ['voice_cycles', 'voice_sessions']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`), table);
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`), table);
    assert.doesNotMatch(sql, new RegExp(`grant [a-z, ]+ on table public\\.${table}`), table);
  }
});

test('reservar, liberar e creditar ciclo só pelo backend; renovar, encerrar e ler saldo pelo app', async () => {
  const sql = await migration();
  for (const fn of ['voice_reserve_block\\(uuid\\)', 'voice_release_failed\\(uuid\\)', 'voice_grant_cycle\\(uuid, text, date\\)']) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn} from public, anon, authenticated;`), fn);
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn} to service_role;`), fn);
  }
  for (const fn of ['voice_renew_block\\(uuid\\)', 'voice_close\\(uuid\\)', 'get_my_voice_balance\\(\\)']) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn} to authenticated;`), fn);
  }
});

test('renovar e encerrar só valem para a própria sessão', async () => {
  const sql = await migration();
  const ownership = sql.match(/v_session\.user_id is distinct from auth\.uid\(\)/g) ?? [];
  assert.equal(ownership.length, 2);
});

test('tempo cobrado vem do relógio do banco; o app nunca informa minutos', async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function public\.voice_close\(p_session_id uuid\)/);
  assert.doesNotMatch(sql, /voice_close\(p_session_id uuid, /);
  assert.match(sql, /extract\(epoch from now\(\) - s\.started_at\)/);
});

test('concorrência: toda operação que muda o saldo trava a linha do ciclo', async () => {
  const sql = await migration();
  const locks = sql.match(/from public\.voice_cycles where id = [a-z_.]+ for update/g) ?? [];
  assert.ok(locks.length >= 3, `esperava 3 travas, achou ${locks.length}`);
});

test('limite imposto no banco por trigger, com hint estável para o app', async () => {
  const sql = await migration();
  assert.match(sql, /create trigger voice_sessions_enforce_quota\s*\nbefore insert or update of reserved_seconds, charged_seconds, status on public\.voice_sessions/);
  assert.match(sql, /hint = 'voz_sem_saldo'/);
  assert.match(sql, /hint = 'voz_sem_assinatura'/);
});

test('ciclo pago é idempotente pela cobrança e usa o fuso de São Paulo', async () => {
  const sql = await migration();
  assert.match(sql, /create unique index if not exists voice_cycles_asaas_payment_id_uidx/);
  assert.match(sql, /on conflict \(asaas_payment_id\) where asaas_payment_id is not null do nothing/);
  assert.match(sql, /at time zone 'America\/Sao_Paulo'/);
});

test('troca de plano agendada é aplicada na cobrança seguinte', async () => {
  const sql = await migration();
  assert.match(sql, /v_tier_id := coalesce\(v_subscription\.pending_tier_id, v_subscription\.tier_id\);/);
  assert.match(sql, /pending_tier_id = null,/);
});

test('bloco de 5 minutos e mínimo de 30 segundos para abrir', async () => {
  const sql = await migration();
  assert.match(sql, /function public\.voice_block_seconds\(\)[\s\S]*?select 300/);
  assert.match(sql, /function public\.voice_min_open_seconds\(\)[\s\S]*?select 30/);
});
