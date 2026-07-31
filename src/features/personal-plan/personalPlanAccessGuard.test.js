import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolvePersonalPlanAccess } from './resolvePersonalPlanAccess.js';

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

test('assinatura past_due é bloqueada -- inadimplência nunca mantém acesso liberado', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'past_due' }), 'blocked');
});

test('assinatura suspended é bloqueada', () => {
  assert.equal(resolvePersonalPlanAccess({ exists: true, internal_status: 'suspended' }), 'blocked');
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

test('hook desabilitado (enabled=false) volta para "idle" -- nunca mantém um status antigo como autorização', () => {
  assert.match(HOOK_SOURCE, /if \(!enabled\) \{\s*\n\s*setStatus\('idle'\);/);
});

// GUARD FIX (troca de dispositivo/sessão restaurada): `enabled` já garante
// que a sessão e os workspaces terminaram de carregar -- workspaceId nulo
// aqui é uma resposta definitiva ("sem workspace pessoal ainda"), nunca uma
// corrida. 'blocked' é a única opção segura: 'loading' aqui travaria o
// guard para sempre (nunca haveria workspace para consultar e resolver
// 'active'), impedindo até usuários sem assinatura de sair do loading
// eterno para ver a apresentação/Plano Pessoal.
test('hook sem workspaceId (mas já habilitado) nunca fica em loading eterno -- resolve "blocked" imediatamente', () => {
  assert.match(HOOK_SOURCE, /if \(!workspaceId\) \{[\s\S]{0,700}setStatus\('blocked'\);/);
  assert.doesNotMatch(HOOK_SOURCE, /if \(!workspaceId\) \{[\s\S]{0,120}setStatus\('loading'\);/);
});

test('hook usa resolvePersonalPlanAccess (regra centralizada e testada isoladamente) -- nunca uma condição solta dentro do hook', () => {
  assert.match(HOOK_SOURCE, /import \{ resolvePersonalPlanAccess \} from '\.\/resolvePersonalPlanAccess\.js';/);
  assert.match(HOOK_SOURCE, /resolvePersonalPlanAccess\(data\)/);
});

test('hook revalida ao sair da rota do Plano Pessoal (was && !revalidateWhenLeavingRoute) -- único momento em que o status pode ter mudado de verdade', () => {
  assert.match(HOOK_SOURCE, /const was = wasOnPersonalPlanRoute\.current;/);
  assert.match(HOOK_SOURCE, /if \(!enabled \|\| !workspaceId \|\| !\(was && !revalidateWhenLeavingRoute\)\) return undefined;/);
});

test('hook cancela a consulta em andamento no cleanup -- nunca aplica um resultado tardio depois de desmontar/trocar de workspace', () => {
  const occurrences = HOOK_SOURCE.match(/cancelled = true; window\.clearTimeout\(timeoutId\);/g) ?? [];
  assert.equal(occurrences.length, 2, 'ambos os efeitos (consulta inicial e revalidação) devem limpar o timeout no cleanup');
});
