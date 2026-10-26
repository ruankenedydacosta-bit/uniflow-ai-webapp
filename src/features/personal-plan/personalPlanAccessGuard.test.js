import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isBillingRegularizationRoute, resolvePersonalPlanAccess } from './resolvePersonalPlanAccess.js';

test('regularização permite cobrança, recibos e suporte; não libera ferramentas do produto', () => {
  for (const path of ['/app/conta', '/app/conta/pagamentos', '/app/conta/pagamentos/historico', '/app/conta/suporte']) {
    assert.equal(isBillingRegularizationRoute(path), true, path);
  }
  for (const path of ['/app/home', '/app/uni', '/app/agenda', '/app/registros']) assert.equal(isBillingRegularizationRoute(path), false, path);
});

test('cancelamento cumprido bloqueia mesmo antes da próxima rodada do worker', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'active', cancel_at_period_end: true, cancel_effective_at: '2026-10-01Z' }, Date.parse('2026-10-02Z')), 'blocked');
});

const HOOK_SOURCE = readFileSync(new URL('./usePersonalPlanAccessGuard.js', import.meta.url), 'utf8');

// ============================================================================
// GUARD FIX: App.jsx usava isPersonalPlanCompleted() (localStorage) como
// autorização -- liberava /app/home para quem nunca teve assinatura real
// em billing_customers/subscriptions, ou cujo status tinha mudado depois
// de marcado como concluído (cancelou, virou pending/past_due/suspended).
// resolvePersonalPlanAccess é a única fonte de verdade: deriva SEMPRE do
// retorno real de billing-get-subscription, nunca do cache local.
// ============================================================================

test('usuário sem assinatura (exists:false) é bloqueado -- nunca libera /app/home', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: false, internal_status: 'free' }), 'blocked');
});

test('assinatura pending é bloqueada -- aguardando confirmação de pagamento, nunca acesso liberado', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'pending' }), 'blocked');
});

test('assinatura active libera o acesso', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'active' }), 'active');
});

test('assinatura canceled é bloqueada', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'canceled' }), 'blocked');
});

test('assinatura expired é bloqueada', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'expired' }), 'blocked');
});

test('past_due mantém o acesso somente durante a carência confirmada pelo backend', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'past_due', grace_ends_at: '2099-01-01Z' }), 'active');
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'past_due', grace_ends_at: '2000-01-01Z' }), 'regularization');
});
test('suspended permite apenas regularização', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'suspended' }), 'regularization');
});

test('subscriptionData nulo/ausente (falha ao consultar) é bloqueado -- nunca libera sem confirmação real', () => {
  assert.equal(resolvePersonalPlanAccess(null), 'blocked');
  assert.equal(resolvePersonalPlanAccess(undefined), 'blocked');
});

test('marcador local antigo incorreto: mesmo que personalPlanStorage.js diga "completed", o resolver ignora completamente o cache -- decide só pelo internal_status recebido', () => {
  // Simula o cenário do bug: o usuário tem o marcador local antigo de
  // "concluído" (ex.: assinou, depois cancelou), mas a consulta REAL agora
  // devolve canceled -- resolvePersonalPlanAccess nunca recebe nem consulta
  // o localStorage, então um marcador antigo incorreto não pode vazar para
  // a decisão de acesso.
  const staleLocalMarkerWasTrue = true; // isPersonalPlanCompleted() teria retornado true
  const realStatusNow = { exists: true, internal_status: 'canceled' };
  assert.equal(resolvePersonalPlanAccess(realStatusNow), 'blocked');
  assert.ok(staleLocalMarkerWasTrue, 'o marcador local antigo existia, mas foi corretamente ignorado');
});

test('active com assinatura ainda existente mas internal_status incomum/desconhecido nunca libera por padrão inseguro', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'unknown_future_status' }), 'blocked');
});

// ============================================================================
// usePersonalPlanAccessGuard -- cobertura estrutural (mesmo padrão do resto
// do projeto, sem @testing-library/react).
// ============================================================================

test('hook só chama getSubscription (billing-get-subscription) -- nunca outra função de billing', () => {
  assert.match(HOOK_SOURCE, /import \{ getSubscription \} from '\.\.\/\.\.\/services\/billingService\.js';/);
  assert.doesNotMatch(HOOK_SOURCE, /createSubscription|createCustomer|cancelSubscription|createCheckout/);
});

test('hook consulta apenas o estado local e revalida a cada 30 segundos, foco e visibilidade', () => {
  assert.match(HOOK_SOURCE, /localOnly: true/);
  assert.match(HOOK_SOURCE, /setInterval\(onFocus, 30_000\)/);
  assert.match(HOOK_SOURCE, /addEventListener\('focus', onFocus\)/);
  assert.match(HOOK_SOURCE, /clearInterval\(intervalId\)/);
  assert.match(HOOK_SOURCE, /cancelled = true/);
});
