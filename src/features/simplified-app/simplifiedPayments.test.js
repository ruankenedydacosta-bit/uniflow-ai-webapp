// ETAPA 4: SimplifiedPaymentsPage.jsx é um componente React real (hooks,
// Supabase real via workspaceService) -- mesmo padrão já usado no projeto
// para telas sem Testing Library/jsdom instalados: cobertura estrutural
// por leitura de fonte (readFileSync/regex), igual a
// simplifiedPlan.test.js e simplifiedSecurity.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// routes.jsx -- pagamentos usa a tela real, demais subrotas continuam
// placeholders.
// ============================================================================

test('routes.jsx renderiza SimplifiedPaymentsPage na rota de pagamentos', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /SimplifiedPaymentsPage/);
  assert.match(
    content,
    /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENTS\]\.path[\s\S]{0,200}<SimplifiedPaymentsPage \/>/,
  );
});

test('routes.jsx filtra as 4 rotas com tela real da lista de placeholders genéricos', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PLAN\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENTS\]\.path/);
});

test('index.js exporta SimplifiedPaymentsPage', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as SimplifiedPaymentsPage \} from '\.\/SimplifiedPaymentsPage\.jsx';/);
});

// ============================================================================
// Cabeçalho.
// ============================================================================

test('cabeçalho tem botão voltar, título "Pagamento e assinatura" e Ajuda reaproveitando o fluxo real da Uni', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /aria-label="Voltar para Conta"/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(content, /<h1>Pagamento e assinatura<\/h1>/);
  assert.match(content, /Ajuda/);
  assert.match(content, /className=\{styles\.helpButton\} onClick=\{\(\) => navigate\(SIMPLIFIED_ROUTES\.UNI\)\}/);
});

// ============================================================================
// Estados do plano -- os mesmos 6 estados reais, honestos.
// ============================================================================

test('trata os 6 estados reais do plano (mesma lógica de SimplifiedPlanPage, duplicada por regra da tarefa)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /status: 'not_configured', label: 'Pagamento ainda não configurado'/);
  assert.match(content, /status: 'active', label: 'Ativo'/);
  assert.match(content, /status: 'trialing', label: 'Período de teste'/);
  assert.match(content, /status: 'past_due', label: 'Pagamento pendente'/);
  assert.match(content, /status: 'canceled', label: 'Cancelado'/);
  assert.match(content, /status: 'expired', label: 'Expirado'/);
});

test('busca a assinatura via getWorkspaceSubscriptionAny (não getWorkspaceSubscription restrito)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /import \{ getWorkspaceSubscriptionAny \} from '\.\.\/\.\.\/services\/workspaceService\.js';/);
});

test('preço vem de PERSONAL_PLAN_PRICE_LABEL/PERIOD, nunca hardcoded', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /PERSONAL_PLAN_PRICE_LABEL/);
  assert.match(content, /PERSONAL_PLAN_PRICE_PERIOD/);
  assert.doesNotMatch(content, /R\$ ?29,90/);
});

// ============================================================================
// Forma de pagamento -- nunca inventada.
// ============================================================================

test('forma de pagamento sempre mostra o estado honesto, nunca cartão fictício', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /Forma de pagamento ainda não configurada\./);
  assert.doesNotMatch(content, /Visa final|Mastercard final|final \d{4}/);
});

// ============================================================================
// Próxima cobrança -- só com dado real.
// ============================================================================

test('próxima cobrança só aparece com renewsAt real; senão mostra o texto honesto pedido', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /\{renewsAt \? \(/);
  assert.match(content, /A cobrança será exibida após a configuração do pagamento\./);
});

// ============================================================================
// Histórico -- nunca fabricado.
// ============================================================================

test('histórico de pagamentos é sempre honesto (nenhuma tabela de pagamentos existe)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /Nenhum pagamento disponível\./);
  assert.doesNotMatch(content, /15\/07\/2026|15\/06\/2026|Pago\b/);
});

test('"Ver histórico completo" fica desabilitado (nunca leva a uma lista fictícia)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /className=\{styles\.disabledLink\} disabled/);
});

// ============================================================================
// Gerenciar assinatura -- honesto, nunca chama Asaas/checkout.
// ============================================================================

test('gerenciar assinatura abre modal honesto, não simula checkout nem chama Asaas', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /setShowManageModal\(true\)/);
  assert.match(content, /será disponibilizada após a integração de pagamento estar concluída/);
  assert.doesNotMatch(content, /createCheckout|asaasClient|window\.open\(.*asaas/i);
});

// ============================================================================
// Cancelar assinatura -- nunca cancela de verdade, sempre honesto.
// ============================================================================

test('cancelar assinatura abre modal de confirmação honesto, nunca muda status real', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /setShowCancelModal\(true\)/);
  assert.match(content, /O cancelamento automático ainda não está disponível nesta versão/);
  assert.match(content, /Nenhuma alteração foi feita na sua assinatura/);
  assert.doesNotMatch(content, /updateSubscription|\.update\(\{\s*status: 'canceled'/);
});

test('zona de cancelamento só aparece quando há assinatura real para cancelar (active/trialing/past_due)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /const canManageOrCancel = \['active', 'trialing', 'past_due'\]\.includes\(planState\.status\);/);
  assert.match(content, /\{canManageOrCancel \? \(/);
});

test('modal de cancelamento não usa window.confirm', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.doesNotMatch(content, /window\.confirm/);
});

// ============================================================================
// Acessibilidade e responsividade.
// ============================================================================

test('CSS oferece foco visível, prefers-reduced-motion e responsividade', async () => {
  const css = await source('./simplifiedPayments.module.css');
  assert.match(css, /\.backButton:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
});

test('status do plano não depende só de cor (Badge com texto + ícone no overview)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /\{planState\.label\}/);
  assert.match(content, /planState\.tone === 'danger' \? <XCircleIcon \/>/);
});
