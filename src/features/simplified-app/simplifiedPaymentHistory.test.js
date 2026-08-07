// BLOCO FINAL DO MVP (Histórico de pagamentos): testes estruturais
// (source-regex) sobre SimplifiedPaymentHistoryPage.jsx -- mesmo padrão já
// usado no projeto para telas sem Testing Library/jsdom (ver
// simplifiedPlan.test.js/simplifiedPayments.test.js).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// Reorganização dos acessos à Uni: "Ajuda" direciona para Suporte, nunca
// abre a conversa da Uni direto (mesmo padrão de Pagamento e assinatura).
test('botão "Ajuda" direciona para Suporte -- nunca abre a Uni direto', async () => {
  const page = await source('./SimplifiedPaymentHistoryPage.jsx');
  const helpButtonStart = page.indexOf('className={styles.helpButton}');
  assert.ok(helpButtonStart > -1);
  const helpButtonSlice = page.slice(helpButtonStart, helpButtonStart + 150);
  assert.match(helpButtonSlice, /navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SUPPORT\]\.path\)/);
  assert.doesNotMatch(page, /SIMPLIFIED_ROUTES/);
});

test('busca pagamentos via billingService.listPayments() -- nunca a Asaas diretamente, nunca uma tabela nova', async () => {
  const page = await source('./SimplifiedPaymentHistoryPage.jsx');
  assert.match(page, /import \{ listPayments \} from '\.\.\/\.\.\/services\/billingService\.js';/);
  assert.match(page, /listPayments\(\{ workspaceId \}\)\.then/);
  assert.doesNotMatch(page, /asaas\.com|supabase\.from\(/i);
});

test('reaproveita a mesma apresentação de status/forma de pagamento usada nas outras telas (mesmos rótulos)', async () => {
  const page = await source('./SimplifiedPaymentHistoryPage.jsx');
  assert.match(page, /import \{ formatDate, resolvePaymentMethodLabel \} from '\.\/subscriptionPresentation\.js';/);
  assert.match(page, /import \{ PAYMENT_DESCRIPTION, resolvePaymentStatusLabel, resolvePaymentStatusTone \} from '\.\/paymentPresentation\.js';/);
});

test('estado vazio honesto: "Nenhum pagamento disponível." -- nunca um pagamento fictício', async () => {
  const page = await source('./SimplifiedPaymentHistoryPage.jsx');
  assert.match(page, /payments\.length === 0 \? \(/);
  assert.match(page, /Nenhum pagamento disponível\./);
});

test('erro de carregamento usa a mensagem honesta pedida, nunca falha silenciosa', async () => {
  const page = await source('./SimplifiedPaymentHistoryPage.jsx');
  assert.match(page, /Não foi possível carregar os dados de pagamento\. Tente novamente\./);
});

test('cada item mostra comprovante (invoice_url) só quando existe -- nunca um link fictício', async () => {
  const page = await source('./SimplifiedPaymentHistoryPage.jsx');
  assert.match(page, /payment\.invoice_url \? \(/);
  assert.match(page, /href=\{payment\.invoice_url\}/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noreferrer noopener"/);
});

test('volta para "Pagamento e assinatura" (drill-down real, não uma tela solta)', async () => {
  const page = await source('./SimplifiedPaymentHistoryPage.jsx');
  assert.match(page, /navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENTS\]\.path\)/);
  assert.match(page, /aria-label="Voltar para Pagamento e assinatura"/);
});
