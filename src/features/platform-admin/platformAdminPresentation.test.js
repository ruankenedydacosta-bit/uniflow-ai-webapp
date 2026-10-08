import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterPlatformUsers,
  PLATFORM_ADMIN_ROUTE,
  resolvePlatformAdminErrorMessage,
  resolveUserPlanSummary,
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

test('erro do banco vira mensagem pelo hint', () => {
  assert.match(resolvePlatformAdminErrorMessage({ hint: 'admin_assinatura_paga' }), /pela cobrança/);
  assert.match(resolvePlatformAdminErrorMessage({ hint: 'admin_acesso_negado' }), /não tem acesso/);
  assert.match(resolvePlatformAdminErrorMessage({ hint: 'admin_checkout_recente' }), /2 horas/);
  assert.match(resolvePlatformAdminErrorMessage({ message: 'falha' }), /Tente de novo/);
  assert.match(resolvePlatformAdminErrorMessage(null), /Tente de novo/);
});
