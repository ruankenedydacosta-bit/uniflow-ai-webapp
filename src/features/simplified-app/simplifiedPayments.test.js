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

test('routes.jsx filtra as 5 rotas com tela real da lista de placeholders genéricos', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PLAN\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENTS\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENT_HISTORY\]\.path/);
});

test('routes.jsx renderiza SimplifiedPaymentHistoryPage na rota de histórico real', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /SimplifiedPaymentHistoryPage/);
  assert.match(
    content,
    /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENT_HISTORY\]\.path[\s\S]{0,200}<SimplifiedPaymentHistoryPage \/>/,
  );
});

test('index.js exporta SimplifiedPaymentHistoryPage', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as SimplifiedPaymentHistoryPage \} from '\.\/SimplifiedPaymentHistoryPage\.jsx';/);
});

test('index.js exporta SimplifiedPaymentsPage', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as SimplifiedPaymentsPage \} from '\.\/SimplifiedPaymentsPage\.jsx';/);
});

// ============================================================================
// Cabeçalho.
// ============================================================================

test('cabeçalho tem botão voltar, título "Pagamento e assinatura" e Ajuda -- direciona para Suporte, nunca abre a Uni direto (reorganização dos acessos à Uni)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /aria-label="Voltar para Conta"/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(content, /<h1>Pagamento e assinatura<\/h1>/);
  assert.match(content, /Ajuda/);
  const helpButtonStart = content.indexOf('className={styles.helpButton}');
  const helpButtonSlice = content.slice(helpButtonStart, helpButtonStart + 150);
  assert.match(helpButtonSlice, /navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SUPPORT\]\.path\)/);
});

// ============================================================================
// Estados do plano -- fonte única compartilhada com Seu plano/Conta.
// Correção (Bloco Saldo + Cobrança): esta tela lia getWorkspaceSubscriptionAny
// (leitura direta da tabela) com seu PRÓPRIO mapeamento de status, que não
// distinguia 'pending'/'suspended' (caíam em "Expirado") e podia divergir
// de "Seu plano" para o MESMO workspace. Agora usa billingService.getSubscription
// (mesma Edge Function/fonte) + subscriptionPresentation.js (mesmo
// mapeamento) -- cobertura detalhada de cada estado vive em
// subscriptionPresentation.test.js.
// ============================================================================

test('usa a fonte única de apresentação de assinatura (subscriptionPresentation.js), nunca reimplementa o mapeamento de status aqui', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(
    content,
    /import \{\s*\n\s*formatDate,\s*\n\s*resolveCancelEffectiveAt,\s*\n\s*resolvePaymentMethodLabel,\s*\n\s*resolvePlanState,\s*\n\s*resolveRenewsAt,\s*\n\s*\} from '\.\/subscriptionPresentation\.js';/,
  );
  assert.doesNotMatch(content, /planState = \{ status:/);
});

test('busca a assinatura via billingService.getSubscription() -- MESMA fonte de "Seu plano", nunca mais getWorkspaceSubscriptionAny (que podia divergir)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /import \{ cancelSubscription, getSubscription, listPayments \} from '\.\.\/\.\.\/services\/billingService\.js';/);
  assert.match(content, /getSubscription\(\{ workspaceId \}\)\.then/);
  assert.doesNotMatch(content, /workspaceService/);
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

test('forma de pagamento mostra o método real (via resolvePaymentMethodLabel) quando conhecido, senão o estado honesto -- nunca cartão fictício', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /\{paymentMethodLabel \? \(/);
  assert.match(content, /Forma de pagamento ainda não configurada\./);
  assert.doesNotMatch(content, /Visa final|Mastercard final|final \d{4}/);
});

// ============================================================================
// Próxima cobrança -- só com dado real.
// ============================================================================

test('próxima cobrança só aparece com renewsAt real; senão mostra o texto honesto pedido (nunca 31/12/2099 ou similar)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /\{renewsAt \? \(/);
  assert.match(content, /Nenhuma próxima cobrança disponível\./);
});

// Correção (Revalidação Bloco Cobrança): cancel_scheduled NUNCA usa o
// rótulo "Próxima cobrança" para a data de encerramento -- usa "Acesso
// disponível até", já que não há cobrança futura real quando o
// cancelamento já está agendado.
test('cancel_scheduled usa "Acesso disponível até", nunca "Próxima cobrança", para a data de encerramento', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  const sectionStart = content.indexOf('cancel_scheduled NUNCA usa o');
  assert.ok(sectionStart > -1, 'comentário explicando a correção deve existir');
  const sectionSlice = content.slice(sectionStart, sectionStart + 2000);
  assert.match(sectionSlice, /\{renewsAt \? 'Próxima cobrança' : cancelEffectiveAt \? 'Acesso disponível até' : 'Próxima cobrança'\}/);
  assert.match(sectionSlice, /Cancelamento agendado -- não haverá nova cobrança\./);
});

// ============================================================================
// Histórico -- nunca fabricado.
// ============================================================================

test('histórico de pagamentos é sempre honesto (nenhuma tabela de pagamentos existe)', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /Nenhum pagamento disponível\./);
  assert.doesNotMatch(content, /15\/07\/2026|15\/06\/2026|Pago\b/);
});

test('"Ver histórico completo" agora navega para a tela real de histórico (BLOCO FINAL DO MVP), nunca uma lista fictícia', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /className=\{styles\.historyLink\}/);
  assert.match(content, /onClick=\{\(\) => navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENT_HISTORY\]\.path\)\}/);
});

test('resumo de histórico usa listPayments real (billing_payments) -- estados honestos de loading/erro/vazio', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /listPayments\(\{ workspaceId, limit: HISTORY_SUMMARY_LIMIT \}\)\.then/);
  assert.match(content, /Não foi possível carregar os dados de pagamento\. Tente novamente\./);
  assert.match(content, /payments\.length === 0 \? \(/);
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
// Cancelar assinatura -- ação real e sincronizada com o backend.
// ============================================================================

test('cancelamento usa billingService, confirma a ação e atualiza o estado do backend', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /import \{ cancelSubscription, getSubscription, listPayments \} from '\.\.\/\.\.\/services\/billingService\.js';/);
  assert.match(content, /setShowCancelModal\(true\)/);
  assert.match(content, /await cancelSubscription\(\{ workspaceId \}\)/);
  assert.match(content, /await getSubscription\(\{ workspaceId \}\)/);
  assert.match(content, /Confirmar cancelamento/);
  assert.match(content, /Ao confirmar, novas cobranças recorrentes serão interrompidas/);
  assert.doesNotMatch(content, /O cancelamento automático ainda não está disponível/);
});

test('zona de cancelamento aparece para assinatura ativa, trial ou inadimplente sem cancelamento agendado', async () => {
  const content = await source('./SimplifiedPaymentsPage.jsx');
  assert.match(content, /const canManageOrCancel = \['active', 'trialing', 'past_due', 'suspended'\]\.includes\(planState\.status\);/);
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
