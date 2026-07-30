import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20260730002500_025_billing_unique_indexes.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// BILLING2.5 (Bloco Asaas 2.5) -- migration complementar, aditiva, criada
// somente porque a homologação de sandbox encontrou o momento de risco zero
// para isso (billing_customers/billing_payments/webhook_events recém-criadas
// pela 024 e subscriptions com zero linhas -- ver auditoria do bloco).
// Cobertura estrutural do SQL, mesmo padrão de billingMigration.test.js.
// ============================================================================

test('migration começa com begin e termina com commit -- atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('billing_customers.workspace_id ganha índice único (nunca dois clientes Asaas para o mesmo workspace)', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /create unique index billing_customers_workspace_id_uidx\s*\n\s*on public\.billing_customers \(workspace_id\);/,
  );
});

test('subscriptions.asaas_subscription_id ganha índice único parcial -- permite múltiplos NULL, único quando presente', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /create unique index subscriptions_asaas_subscription_id_uidx\s*\n\s*on public\.subscriptions \(asaas_subscription_id\)\s*\n\s*where asaas_subscription_id is not null;/,
  );
});

test('no máximo uma assinatura corrente por workspace/plano -- índice único parcial exclui apenas os estados terminais', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /create unique index subscriptions_one_current_per_workspace_plan_uidx\s*\n\s*on public\.subscriptions \(workspace_id, plan_id\)\s*\n\s*where status not in \('canceled', 'expired'\);/,
  );
});

test('pending/trialing/active/past_due/suspended continuam contando como "corrente" -- só canceled/expired ficam de fora do índice', async () => {
  const sql = await migration();
  const idx = sql.indexOf('subscriptions_one_current_per_workspace_plan_uidx');
  const slice = sql.slice(idx, idx + 300);
  for (const excluded of ['canceled', 'expired']) {
    assert.match(slice, new RegExp(`'${excluded}'`), `${excluded} deveria estar na cláusula where`);
  }
  for (const current of ['pending', 'trialing', 'active', 'past_due', 'suspended']) {
    assert.doesNotMatch(slice, new RegExp(`'${current}'`), `${current} não deveria aparecer excluído do índice`);
  }
});

test('cancelamento agendado com acesso ainda vigente continua "corrente" -- decisão documentada no comentário, não checada via cancel_at_period_end', async () => {
  const sql = await migration();
  assert.match(sql, /cancelamento agendado.*[\s\S]*nao tira a assinatura[\s\S]*de "corrente"/i);
});

test('nenhum campo especulativo do Bloco 3 é adicionado (provider_status/last_synced_at/last_sync_error) -- só podem aparecer em comentário explicando a exclusão, nunca em "add column"', async () => {
  const sql = await migration();
  for (const speculative of ['provider_status', 'last_synced_at', 'last_sync_error']) {
    assert.doesNotMatch(sql, new RegExp(`add column ${speculative}`), `${speculative} não deveria ser adicionado nesta migration`);
  }
});

test('nenhuma tabela é criada ou removida -- só índices aditivos sobre tabelas já existentes (024)', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /create table/i);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /drop index/i);
});
