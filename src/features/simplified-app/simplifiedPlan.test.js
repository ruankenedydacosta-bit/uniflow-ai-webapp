// ETAPA 4 / BLOCO FINAL DO MVP: SimplifiedPlanPage.jsx é um componente
// React real (hooks, billingService real) -- mesmo padrão já usado no
// projeto para telas sem Testing Library/jsdom instalados: cobertura
// estrutural por leitura de fonte (readFileSync/regex).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// routes.jsx -- plano usa a tela real, demais subrotas continuam
// placeholders.
// ============================================================================

test('routes.jsx renderiza SimplifiedPlanPage na rota de plano', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /SimplifiedPlanPage/);
  assert.match(
    content,
    /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PLAN\]\.path[\s\S]{0,200}<SimplifiedPlanPage \/>/,
  );
});

test('routes.jsx filtra editar-perfil, segurança E plano da lista de placeholders genéricos', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PLAN\]\.path/);
});

test('index.js exporta SimplifiedPlanPage', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as SimplifiedPlanPage \} from '\.\/SimplifiedPlanPage\.jsx';/);
});

// ============================================================================
// BLOCO FINAL DO MVP: fonte de dados agora é billing-get-subscription (o
// backend Asaas real, já homologado no Sandbox) -- não mais a leitura
// direta getWorkspaceSubscriptionAny (Bloco Asaas 2.5), que não distinguia
// pending/suspended/cancel_at_period_end.
// ============================================================================

test('usa billingService.getSubscription/cancelSubscription -- nunca mais getWorkspaceSubscriptionAny', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /import \{ cancelSubscription, getSubscription \} from '\.\.\/\.\.\/services\/billingService\.js';/);
  assert.doesNotMatch(content, /import.*workspaceService/);
  assert.doesNotMatch(content, /getWorkspaceSubscriptionAny\(/);
});

test('getWorkspaceSubscriptionAny continua existindo em workspaceService.js (não foi removida, só deixou de ser usada aqui)', async () => {
  const content = await source('../../services/workspaceService.js');
  assert.match(content, /export async function getWorkspaceSubscriptionAny\(workspaceId\)/);
});

test('carrega a assinatura via loadSubscription (useCallback) reaproveitável pelo cancelamento', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /const loadSubscription = useCallback\(\(\) => \{/);
  assert.match(content, /getSubscription\(\{ workspaceId \}\)\.then/);
});

// ============================================================================
// Cabeçalho.
// ============================================================================

test('cabeçalho tem botão voltar, título "Seu plano" e Falar com a Uni real', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /aria-label="Voltar para Conta"/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(content, /<h1>Seu plano<\/h1>/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.UNI\)/);
});

// ============================================================================
// Estados do plano -- honestos, cobrindo os 8 estados reais do backend.
// ============================================================================

test('resolvePlanState trata os 8 estados reais: not_configured, active, pending, trialing, past_due, suspended, cancel_scheduled, canceled/expired', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /status: 'not_configured', label: 'Pagamento ainda não configurado'/);
  assert.match(content, /status: 'cancel_scheduled', label: 'Cancelamento agendado'/);
  assert.match(content, /status: 'active', label: 'Seu plano está ativo'/);
  assert.match(content, /status: 'pending', label: 'Aguardando pagamento'/);
  assert.match(content, /status: 'trialing', label: 'Período de teste'/);
  assert.match(content, /status: 'past_due', label: 'Pagamento em atraso'/);
  assert.match(content, /status: 'suspended', label: 'Assinatura suspensa'/);
  assert.match(content, /status: 'canceled', label: 'Plano cancelado'/);
  assert.match(content, /return \{ status: 'expired', label: 'Plano expirado'/);
});

test('cancel_at_period_end é checado ANTES de "active" puro -- nunca mostra "ativo" sem indicar o cancelamento agendado', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  const activeCancelIdx = content.indexOf("status === 'active' && cancelAtPeriodEnd");
  const activeOnlyIdx = content.indexOf("if (status === 'active') {");
  assert.ok(activeCancelIdx > -1 && activeOnlyIdx > activeCancelIdx, 'a checagem com cancelAtPeriodEnd deve vir antes da checagem simples de active');
});

test('sem assinatura nunca vira "Plano ativo" -- cai no fallback honesto not_configured', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /if \(!subscription\?\.exists\) \{\s*\n\s*return \{ status: 'not_configured'/);
  assert.match(content, /Você ainda não possui uma assinatura ativa\./);
});

test('preço vem de PERSONAL_PLAN_PRICE_LABEL/PERIOD (fonte única), nunca hardcoded aqui', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /PERSONAL_PLAN_PRICE_LABEL/);
  assert.match(content, /PERSONAL_PLAN_PRICE_PERIOD/);
  assert.doesNotMatch(content, /R\$ ?29,90/);
});

// ============================================================================
// Dados de pagamento -- nunca inventados.
// ============================================================================

test('nunca exibe cartão, bandeira ou últimos 4 dígitos fictícios', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.doesNotMatch(content, /Visa|Mastercard|final \d{4}/);
});

test('renova em / acesso até / teste encerra em só aparecem quando há dado real (current_period_ends_at/cancel_effective_at/trial_ends_at)', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /const renewsAt = \['active', 'cancel_scheduled', 'trialing'\]\.includes\(planState\.status\)/);
  assert.match(content, /const cancelEffectiveAt = planState\.status === 'cancel_scheduled' \? subscription\?\.cancel_effective_at : null;/);
  assert.match(content, /\{renewsAt \? \(/);
  assert.match(content, /\{cancelEffectiveAt \? \(/);
});

// ============================================================================
// Economia -- honestamente indisponível, nunca um valor calculado.
// ============================================================================

test('economia gerada pela Uni nunca mostra valor calculado, sempre o estado honesto', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /A Uni ainda está reunindo dados suficientes para estimar sua economia\./);
  assert.doesNotMatch(content, /R\$ ?842|R\$\s*\d{3},\d{2}(?!.*mês)/);
});

// ============================================================================
// Utilização -- só a métrica real e auditável (transações do mês).
// ============================================================================

test('utilização usa useTransactions com dateFrom/dateTo do mês corrente', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /useTransactions\(\{\s*workspaceId,\s*dateFrom,\s*dateTo,\s*\}\)/);
  assert.match(content, /const monthlyCount = transactions\.length;/);
});

test('não inventa lembretes, análises ou alertas -- só a contagem real de registros', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.doesNotMatch(content, /lembretes enviados|análises financeiras|alertas importantes/);
});

// ============================================================================
// Recomendação da Uni -- honesta, derivada dos dados reais.
// ============================================================================

test('recomendação deriva do monthlyCount real, nunca afirma "vale a pena" sem base', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /monthlyCount > 0\s*\n\s*\? `Você organizou \$\{monthlyCount\}/);
  assert.match(content, /Continue usando a UniFlow para acompanhar os benefícios do seu plano\./);
  assert.doesNotMatch(content, /valendo a pena/);
});

// ============================================================================
// BLOCO FINAL DO MVP: cancelamento real -- nunca corta acesso imediato.
// ============================================================================

test('botão "Gerenciar assinatura" some para not_configured/canceled/expired -- vira "Assinar Plano Pessoal" direto', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(
    content,
    /planState\.status === 'not_configured' \|\| planState\.status === 'canceled' \|\| planState\.status === 'expired'/,
  );
  assert.match(content, /Assinar Plano Pessoal/);
});

test('modal "Gerenciar assinatura" só oferece cancelar quando canCancel (status active sem cancelamento já agendado)', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /const canCancel = planState\.status === 'active';/);
  assert.match(content, /\{canCancel \? \(/);
  assert.match(content, /Cancelar assinatura/);
});

test('modal de confirmação de cancelamento explica que o acesso continua até o fim do período pago', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /Seu acesso ao Plano Pessoal continua funcionando normalmente até o fim do período já pago\./);
});

test('confirmar cancelamento chama billingService.cancelSubscription e recarrega a assinatura (nunca corta acesso local manualmente)', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  const idx = content.indexOf('async function handleConfirmCancel');
  const endIdx = content.indexOf('return (', idx);
  const body = content.slice(idx, endIdx);
  assert.match(body, /await cancelSubscription\(\{ workspaceId \}\);/);
  assert.match(body, /loadSubscription\(\);/);
  assert.doesNotMatch(body, /setSubscription\(\{/, 'nunca deveria fabricar um novo estado local -- sempre recarrega do backend');
});

test('erro ao cancelar preserva o modal aberto e mostra mensagem sanitizada -- nunca fecha silenciosamente', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  const idx = content.indexOf('async function handleConfirmCancel');
  const endIdx = content.indexOf('return (', idx);
  const body = content.slice(idx, endIdx);
  assert.match(body, /if \(error\) \{\s*\n\s*setCancelError\('Não foi possível cancelar agora\. Tente novamente em instantes\.'\);\s*\n\s*return;/);
});

test('modal de cancelamento não pode ser fechado durante isCancelling (evita cancelar duas vezes)', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /onClose={\(\) => \{ if \(!isCancelling\) setShowCancelModal\(false\); \}}/);
});

// ============================================================================
// Acessos inferiores -- rotas reais/placeholders honestos existentes.
// ============================================================================

test('acessos inferiores navegam para rotas reais já existentes (nenhuma nova rota inventada)', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENTS\]\.path\)/);
  assert.match(content, /navigate\(PERSONAL_PLAN_ROUTE\)/);
});

// ============================================================================
// Acessibilidade e responsividade.
// ============================================================================

test('CSS oferece foco visível, prefers-reduced-motion e responsividade', async () => {
  const css = await source('./simplifiedPlan.module.css');
  assert.match(css, /\.backButton:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
});

test('status do plano não depende só de cor (tem ícone + texto)', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /planState\.tone === 'danger' \? <XCircleIcon \/>/);
  assert.match(content, /planState\.tone === 'warn' \? <AlertTriangleIcon \/>/);
  assert.match(content, /planState\.tone === 'neutral' \? <InfoIcon \/>/);
  assert.match(content, /<strong>\{planState\.label\}<\/strong>/);
});
