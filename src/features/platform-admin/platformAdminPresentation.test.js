import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterPlatformUsers,
  formatUsageDuration,
  keepsManualPlanPeriod,
  PLATFORM_ADMIN_ROUTE,
  rankByAppTime,
  rankUniUsage,
  resolvePlatformAdminErrorMessage,
  resolveUserPlanSummary,
  summarizeUsage,
  USAGE_RANKING_LIMIT,
} from './platformAdminPresentation.js';

const USERS = [
  { user_id: '1', full_name: 'João Conceição', email: 'joao@exemplo.com' },
  { user_id: '2', full_name: null, email: 'MARIA@exemplo.com' },
  { user_id: '3', full_name: 'Ana', email: 'ana@exemplo.com' },
];

test('rota do painel fica dentro de /app/conta', () => {
  assert.equal(PLATFORM_ADMIN_ROUTE, '/app/conta/admin');
});

test('busca ignora acento e caixa nos dois lados', () => {
  assert.deepEqual(filterPlatformUsers(USERS, 'conceicao').map((user) => user.user_id), ['1']);
  assert.deepEqual(filterPlatformUsers(USERS, 'JOÃO').map((user) => user.user_id), ['1']);
  assert.deepEqual(filterPlatformUsers(USERS, 'maria@').map((user) => user.user_id), ['2']);
});

test('busca vazia devolve a lista inteira', () => {
  assert.equal(filterPlatformUsers(USERS, '   ').length, 3);
});

test('sem assinatura: pode conceder, não pode encerrar', () => {
  const summary = resolveUserPlanSummary({ subscription_status: null });
  assert.equal(summary.label, 'Sem plano');
  assert.equal(summary.canGrant, true);
  assert.equal(summary.canRevoke, false);
  assert.equal(summary.lastStatusLabel, null);
});

test('assinatura encerrada conta como sem plano e mostra o último status', () => {
  const summary = resolveUserPlanSummary({ subscription_status: 'expired', subscription_source: 'manual', tier_id: 'uni_voz' });
  assert.equal(summary.label, 'Sem plano');
  assert.equal(summary.canGrant, true);
  assert.equal(summary.lastStatusLabel, 'Expirado');
});

test('plano manual ativo: pode renovar e encerrar', () => {
  const summary = resolveUserPlanSummary({ subscription_status: 'active', subscription_source: 'manual', tier_id: 'uni_voz_plus' });
  assert.equal(summary.tierName, 'Uni Voz Plus');
  assert.equal(summary.isManual, true);
  assert.equal(summary.canGrant, true);
  assert.equal(summary.canRevoke, true);
  assert.equal(summary.tone, 'ok');
});

test('pagamento pendente deixa tentar: o banco decide se é checkout abandonado', () => {
  const summary = resolveUserPlanSummary({ subscription_status: 'pending', subscription_source: 'asaas', tier_id: 'uni_voz' });
  assert.equal(summary.canGrant, true);
  assert.equal(summary.canRevoke, false);
  assert.equal(summary.isManual, false);
});

test('assinatura da Asaas corrente não é alterada pelo painel', () => {
  for (const status of ['active', 'past_due', 'suspended']) {
    const summary = resolveUserPlanSummary({ subscription_status: status, subscription_source: 'asaas', tier_id: 'uni_voz' });
    assert.equal(summary.canGrant, false, status);
    assert.equal(summary.canRevoke, false, status);
  }
});

test('linha da Asaas sem cobrança pode virar plano manual, mas não ser encerrada', () => {
  const summary = resolveUserPlanSummary({
    subscription_status: 'active', subscription_source: 'asaas', subscription_billed: false, tier_id: 'uni_voz',
  });
  assert.equal(summary.canGrant, true);
  assert.equal(summary.canRevoke, false);
  assert.equal(summary.isManual, false);
});

test('assinatura ligada à Asaas segue fora do painel', () => {
  const summary = resolveUserPlanSummary({
    subscription_status: 'active', subscription_source: 'asaas', subscription_billed: true, tier_id: 'uni_voz',
  });
  assert.equal(summary.canGrant, false);
});

test('troca pela lista mantém a data só de plano manual ativo e no prazo', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const manual = { subscription_source: 'manual', subscription_status: 'active', current_period_ends_at: '2026-11-08T12:00:00Z' };
  assert.equal(keepsManualPlanPeriod(manual, now), true);
  assert.equal(keepsManualPlanPeriod({ ...manual, current_period_ends_at: '2026-10-08T11:58:00Z' }, now), false);
  assert.equal(keepsManualPlanPeriod({ ...manual, subscription_source: 'asaas' }, now), false);
  assert.equal(keepsManualPlanPeriod({ subscription_status: null }, now), false);
});

test('erro do banco vira mensagem pelo hint', () => {
  assert.match(resolvePlatformAdminErrorMessage({ hint: 'admin_assinatura_paga' }), /pela cobrança/);
  assert.match(resolvePlatformAdminErrorMessage({ hint: 'admin_acesso_negado' }), /não tem acesso/);
  assert.match(resolvePlatformAdminErrorMessage({ hint: 'admin_checkout_recente' }), /2 horas/);
  assert.match(resolvePlatformAdminErrorMessage({ hint: 'admin_bloquear_a_si' }), /própria conta/);
  assert.match(resolvePlatformAdminErrorMessage({ hint: 'admin_bloquear_admin' }), /equipe/);
  assert.match(resolvePlatformAdminErrorMessage({ message: 'falha' }), /Tente de novo/);
  assert.match(resolvePlatformAdminErrorMessage(null), /Tente de novo/);
});

function usageRow(id, fields) {
  return { user_id: id, visits: 0, active_seconds: 0, prompts: 0, voice_seconds: 0, ...fields };
}

test('duração do uso mostra segundos, minutos ou horas', () => {
  assert.equal(formatUsageDuration(0), '0 s');
  assert.equal(formatUsageDuration(45), '45 s');
  assert.equal(formatUsageDuration(779), '12 min');
  assert.equal(formatUsageDuration(3900), '1 h 05 min');
  assert.equal(formatUsageDuration(null), '0 s');
});

test('ranking de acessos ordena pelo tempo e deixa de fora quem só usou a Uni', () => {
  const rows = [
    usageRow('a', { visits: 3, active_seconds: 60 }),
    usageRow('b', { visits: 1, active_seconds: 600 }),
    usageRow('c', { prompts: 4 }),
    usageRow('d', { visits: 2, active_seconds: 60 }),
  ];
  assert.deepEqual(rankByAppTime(rows).map((row) => row.user_id), ['b', 'a', 'd']);
});

test('top da Uni ordena pela métrica escolhida e desempata pela outra', () => {
  const rows = [
    usageRow('a', { prompts: 10, voice_seconds: 0 }),
    usageRow('b', { prompts: 2, voice_seconds: 900 }),
    usageRow('c', { prompts: 10, voice_seconds: 60 }),
    usageRow('d', { visits: 5, active_seconds: 300 }),
  ];
  assert.deepEqual(rankUniUsage(rows, 'prompts').map((row) => row.user_id), ['c', 'a', 'b']);
  assert.deepEqual(rankUniUsage(rows, 'voice').map((row) => row.user_id), ['b', 'c', 'a']);
});

test('top da Uni mostra no máximo 25 pessoas', () => {
  const rows = Array.from({ length: 30 }, (_, index) => usageRow(String(index), { prompts: index + 1 }));
  const ranking = rankUniUsage(rows, 'prompts');
  assert.equal(ranking.length, USAGE_RANKING_LIMIT);
  assert.equal(ranking[0].prompts, 30);
});

test('resumo do uso soma o período inteiro', () => {
  const summary = summarizeUsage([
    usageRow('a', { visits: 2, active_seconds: 600, prompts: 5, voice_seconds: 120 }),
    usageRow('b', { prompts: 1 }),
    usageRow('c', { visits: 1, active_seconds: 30 }),
  ]);
  assert.deepEqual(summary, { appUsers: 2, appSeconds: 630, uniUsers: 2, prompts: 6, voiceSeconds: 120 });
});

test('período inválido no relatório pede para escolher da lista', () => {
  assert.equal(
    resolvePlatformAdminErrorMessage({ hint: 'admin_periodo_relatorio_invalido' }),
    'Escolha um dos períodos da lista.',
  );
});
