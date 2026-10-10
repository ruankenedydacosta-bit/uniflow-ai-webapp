import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// BLOCO ASAAS CHECKOUT: rota de retorno do Checkout hospedado (cartão) --
// cobertura estrutural (mesmo padrão do resto do projeto, sem
// @testing-library/react).
// ============================================================================

test('rota registrada em routes.jsx, standalone, usando PERSONAL_PLAN_RETURN_ROUTE (nunca string hardcoded)', async () => {
  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /path: PERSONAL_PLAN_RETURN_ROUTE,/);
  assert.match(routes, /standalone: true,[\s\S]*?element: <PersonalPlanReturnPage \/>/);
});

test('PERSONAL_PLAN_RETURN_ROUTE é derivado de PERSONAL_PLAN_ROUTE -- nunca duplicado como string solta', async () => {
  const config = await source('./personalPlanConfig.js');
  assert.match(config, /export const PERSONAL_PLAN_RETURN_ROUTE = `\$\{PERSONAL_PLAN_ROUTE\}\/retorno`;/);
});

test('index.js exporta PersonalPlanReturnPage e PERSONAL_PLAN_RETURN_ROUTE', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as PersonalPlanReturnPage \} from '\.\/PersonalPlanReturnPage\.jsx';/);
  assert.match(content, /PERSONAL_PLAN_RETURN_ROUTE,/);
});

test('nunca considera o plano ativo só pelo redirecionamento -- sempre consulta via useSubscriptionStatusPolling (billing-get-subscription)', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  assert.match(page, /import \{ useSubscriptionStatusPolling \} from '\.\/useSubscriptionStatusPolling\.js';/);
  assert.match(page, /const \{ status: polledSubscription, error: pollError, isPolling \} = useSubscriptionStatusPolling\(\{/);
  // ?status=success da URL é só um hint de UX -- nunca a fonte de verdade.
  assert.doesNotMatch(page, /redirectStatus === 'success'[\s\S]{0,60}setResolvedState\('active'\)/);
});

test('polling fica ativo até resolvedState ser definido (active/canceled/expired) -- nunca contínuo fora da tela', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  assert.match(page, /active: !resolvedState,/);
});

test('detecta "active" e marca personalPlanCompleted automaticamente -- mesma lógica de PersonalPlanPage.jsx', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  const idx = page.indexOf("if (currentStatus === 'active')");
  const slice = page.slice(idx, idx + 650);
  assert.match(slice, /setResolvedState\('active'\);/);
  assert.match(slice, /markPersonalPlanCompleted\(userId\);/);
});

test('active no retorno confirma subscription_activated com transição/marker idempotente antes de concluir a UI', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  assert.match(page, /createGa4SubscriptionActivationLifecycle/);
  assert.match(page, /const previousStatus = previousPolledStatusRef\.current;/);
  assert.match(page, /trackConfirmedGa4SubscriptionActivation\(\{[\s\S]*?previousStatus,[\s\S]*?currentStatus,[\s\S]*?markWitnessedActivation/);

  const activeBranch = page.slice(
    page.indexOf("if (currentStatus === 'active')"),
    page.indexOf("} else if (['canceled', 'expired'].includes(currentStatus))"),
  );
  assert.ok(activeBranch.indexOf('trackConfirmedGa4SubscriptionActivation') < activeBranch.indexOf("setResolvedState('active')"));
});

test('canceled/expired são tratados como estados terminais distintos -- nunca reativados por engano', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  assert.match(page, /\['canceled', 'expired'\]\.includes\(currentStatus\)/);
  assert.match(page, /setResolvedState\(currentStatus\);/);
  assert.match(page, /clearPendingGa4SubscriptionActivation\(\);/);
});

test('timeout do polling (limite de tentativas) preserva o último estado conhecido -- nunca trava num spinner infinito', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  assert.match(page, /const timedOut = !resolvedState && !isPolling && polledSubscription !== null;/);
});

test('cobre os 4 estados pedidos: processando, aguardando/timeout, ativo, falhou/cancelado', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  assert.match(page, /Processando seu pagamento/);
  assert.match(page, /Ainda aguardando a confirmação/);
  assert.match(page, /Pagamento confirmado/);
  assert.match(page, /Pagamento não concluído/);
});

// Tela 21g–i: confirmado leva ao início; processando não tem botão (a tela
// atualiza sozinha); não concluído e tempo esgotado voltam ao Plano Pessoal.
test('ativo oferece ir para o início, processando não tem botão e os demais voltam ao Plano Pessoal', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  assert.match(page, /Voltar ao Plano Pessoal/);
  assert.match(page, /onClick=\{handleBackToPlan\}/);
  assert.match(page, /navigate\(PERSONAL_PLAN_ROUTE\);/);
  assert.match(page, /action=\{resolvedState === 'active' \? \([\s\S]*?handleGoHome[\s\S]*?\) : isProcessing \? null : \(/);
});

test('cada estado usa o orb da Uni: falando no confirmado, pensando no processando, parado nos demais', async () => {
  const page = await source('./PersonalPlanReturnPage.jsx');
  const screen = await source('./PlanResultScreen.jsx');
  const css = await source('./PersonalPlanReturn.module.css');
  assert.match(page, /orbState = UNI_RING_ORB_STATES\.SPEAKING;/);
  assert.match(page, /orbState = UNI_RING_ORB_STATES\.THINKING;/);
  assert.match(page, /orbState = UNI_RING_ORB_STATES\.IDLE;/);
  assert.match(screen, /<UniRingOrb size=\{120\} state=\{orbState\} \/>/);
  assert.match(screen, /aria-live="polite"/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
});
