// ETAPA 4 / BLOCO FINAL DO MVP: SimplifiedPlanPage.jsx é um componente
// React real (hooks, billingService real) -- mesmo padrão já usado no
// projeto para telas sem Testing Library/jsdom instalados: cobertura
// estrutural por leitura de fonte (readFileSync/regex).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// routes.jsx -- plano usa a tela real.
// ============================================================================

test('routes.jsx renderiza SimplifiedPlanPage na rota de plano', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /SimplifiedPlanPage/);
  assert.match(
    content,
    /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PLAN\]\.path[\s\S]{0,200}<SimplifiedPlanPage \/>/,
  );
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

test('usa useAssinatura e billingService.cancelSubscription -- nunca mais getWorkspaceSubscriptionAny', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /import \{ cancelSubscription, changePlan \} from '\.\.\/\.\.\/services\/billingService\.js';/);
  assert.match(content, /import \{ useAssinatura \} from '\.\/useAssinatura\.js';/);
  assert.doesNotMatch(content, /import.*workspaceService/);
  assert.doesNotMatch(content, /getWorkspaceSubscriptionAny\(/);
});

test('getWorkspaceSubscriptionAny continua existindo em workspaceService.js (não foi removida, só deixou de ser usada aqui)', async () => {
  const content = await source('../../services/workspaceService.js');
  assert.match(content, /export async function getWorkspaceSubscriptionAny\(workspaceId\)/);
});

test('lê a assinatura guardada e revalida via loadSubscription (useCallback), reaproveitável pelo cancelamento', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /\} = useAssinatura\(workspaceId\);/);
  assert.match(content, /const loadSubscription = useCallback\(\(\) => \{/);
  // Depois de cancelar ou trocar de plano, a tela não segue mostrando o plano antigo.
  assert.match(content, /reloadSubscription\(\{ descartar: true \}\);/);
  assert.doesNotMatch(content, /getSubscription\(/);
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
// Estados do plano -- honestos, cobrindo os 9 estados reais do backend.
// Correção (Bloco Saldo + Cobrança): resolvePlanState/renewsAt/etc. saíram
// de SimplifiedPlanPage.jsx para subscriptionPresentation.js (fonte única
// reaproveitada por Conta e Pagamento e assinatura também) -- cobertura
// detalhada de cada estado vive em subscriptionPresentation.test.js; aqui
// só confirmamos que esta tela usa a fonte compartilhada.
// ============================================================================

test('usa a fonte única de apresentação de assinatura (subscriptionPresentation.js), nunca reimplementa o mapeamento de status aqui', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(
    content,
    /import \{\s*\n\s*formatDate,\s*\n\s*resolveCancelEffectiveAt,\s*\n\s*resolvePaymentMethodLabel,\s*\n\s*resolvePlanState,\s*\n\s*resolveRenewsAt,\s*\n\s*resolveTrialEndsAt,\s*\n\s*\} from '\.\/subscriptionPresentation\.js';/,
  );
  assert.doesNotMatch(content, /function resolvePlanState/);
  assert.doesNotMatch(content, /function formatDate/);
});

test('sem assinatura nunca vira "Plano ativo" -- fallback honesto not_configured', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
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
  assert.match(content, /const renewsAt = resolveRenewsAt\(subscription, planState\);/);
  assert.match(content, /const cancelEffectiveAt = resolveCancelEffectiveAt\(subscription, planState\);/);
  assert.match(content, /const trialEndsAt = resolveTrialEndsAt\(subscription, planState\);/);
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

test('modal "Gerenciar assinatura" só oferece cancelar quando canCancel (status active sem cancelamento já agendado, fora de plano manual)', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /const canCancel = planState\.status === 'active' && !isManualPlan;/);
  assert.match(content, /confirmLabel=\{canCancel \? 'Cancelar assinatura' : 'Entendi'\}/);
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

test('"Ver histórico de pagamentos" e "Notas fiscais e recibos" abrem a MESMA tela real de histórico (BLOCO FINAL DO MVP) -- reutilizam os mesmos dados', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  const matches = content.match(/navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENT_HISTORY\]\.path\)/g) ?? [];
  assert.equal(matches.length, 2, 'ambos os quick links devem apontar para a tela real de histórico');
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

// ============================================================================
// Épico #116 -- três planos, minutos de voz e troca de plano.
// ============================================================================

test('plano e preço exibidos são os da assinatura, com o Plano Pessoal padrão como reserva', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /\{subscription\?\.plan_name \?\? 'Plano Pessoal'\}/);
  assert.match(content, /\{formatPlanPrice\(subscription\?\.value\) \|\| PERSONAL_PLAN_PRICE_LABEL\}/);
});

test('mostra os minutos de voz restantes só para assinatura ativa', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /getMyVoiceBalance\(\)\.then/);
  assert.match(content, /const voiceBalanceText = planState\.status === 'active' \? describeVoiceBalance\(voiceBalance\) : null;/);
  assert.match(content, /aria-label="Conversa por voz"/);
});

test('"Trocar de plano" abre a troca para assinatura ativa e leva à assinatura nos outros casos', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /onClick=\{handleOpenChangePlan\}/);
  assert.match(content, /if \(planState\.status !== 'active' \|\| !currentTierId\) \{\s*navigate\(PERSONAL_PLAN_ROUTE\);/);
  assert.match(content, /changePlan\(\{ workspaceId, tierId: selectedTierId \}\)/);
});

test('upgrade mostra o Pix da diferença que a Edge Function devolveu', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /if \(data\?\.kind === 'upgrade' && data\.pix\) \{\s*setUpgradePix\(data\.pix\);/);
  assert.match(content, /src=\{`data:image\/png;base64,\$\{upgradePix\.encoded_image\}`\}/);
});

test('troca agendada aparece como aviso com a data da renovação', async () => {
  const content = await source('./SimplifiedPlanPage.jsx');
  assert.match(content, /`A partir de \$\{formatDate\(renewsAt\)\}, seu plano passa a ser \$\{subscription\.pending_tier_name\}\.`/);
});
