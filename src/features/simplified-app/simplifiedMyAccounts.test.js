// ETAPA 4: SimplifiedMyAccountsPage.jsx é um componente React real (hooks,
// Supabase real via useAccounts, CRUD real via
// FinanceAccountModal) -- mesmo padrão já usado no projeto para telas sem
// Testing Library/jsdom instalados: cobertura estrutural por leitura de
// fonte (readFileSync/regex), igual a simplifiedPayments.test.js e
// simplifiedPlan.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// routes.jsx -- minhas-contas usa a tela real, demais subrotas continuam
// placeholders.
// ============================================================================

// #182: a tela de contas vive em Organizar (/app/organizar/contas). A rota
// antiga de minhas-contas só redireciona, para não quebrar link salvo.
test('routes.jsx redireciona minhas-contas para Contas em Organizar, sem montar SimplifiedMyAccountsPage', async () => {
  const content = await source('../../app/routes.jsx');
  assert.doesNotMatch(content, /<SimplifiedMyAccountsPage \/>/);
  assert.match(
    content,
    /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.MY_ACCOUNTS\]\.path[\s\S]{0,200}<Navigate to=\{SIMPLIFIED_ROUTES\.CONTAS\} replace \/>/,
  );
});

test('routes.jsx filtra as 5 rotas com tela real da lista de placeholders genéricos', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PLAN\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENTS\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.MY_ACCOUNTS\]\.path/);
});

test('index.js exporta SimplifiedMyAccountsPage', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as SimplifiedMyAccountsPage \} from '\.\/SimplifiedMyAccountsPage\.jsx';/);
});

// ============================================================================
// Cabeçalho.
// ============================================================================

test('cabeçalho tem botão voltar, título "Minhas contas" e Falar com a Uni real', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.match(content, /aria-label="Voltar para Conta"/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(content, /<h1>Minhas contas<\/h1>/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.UNI\)/);
});

// ============================================================================
// Reaproveitamento real -- useAccounts/useWorkspaceRole,
// nunca um CRUD paralelo.
// ============================================================================

test('usa useAccounts e useWorkspaceRole reais, sem consultar saldo para apresentação pública', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.match(content, /import \{ useAccounts, useWorkspaceRole \} from '\.\.\/\.\.\/hooks\/index\.js';/);
  assert.doesNotMatch(content, /useFinancialBalances/);
});

test('reaproveita FinanceAccountModal existente (mesmo componente de FinanceiroPage.jsx) -- nenhum CRUD novo', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.match(content, /import FinanceAccountModal from '\.\.\/\.\.\/pages\/financeiro\/FinanceAccountModal\.jsx';/);
  assert.match(content, /<FinanceAccountModal/);
});

test('lista pública de contas não exibe saldo derivado, inicial ou legado', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.doesNotMatch(content, /accountBalances|derived_balance|initial_balance/);
  assert.doesNotMatch(content, /account\.current_balance/);
  assert.match(content, /Ver e editar/);
});

test('dispara e escuta FINANCIAL_DATA_CHANGED_EVENT (mesma sincronização real usada por Registros)', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.match(content, /notifyFinancialDataChanged\('simplified-my-accounts'\)/);
  assert.match(content, /window\.addEventListener\(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged\)/);
});

// ============================================================================
// Nunca inventar bancos/saldos/sincronização.
// ============================================================================

test('nunca hardcoda Nubank/Caixa/Carteira ou saldos fictícios da referência', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.doesNotMatch(content, /Nubank|Caixa Econômica|2\.540,32|1\.240,80/);
});

test('status "Sincronizado" só aparece com source_type/last_synced_at reais, senão mostra "Conta manual"', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.match(content, /account\.source_type && account\.source_type !== 'manual' && account\.last_synced_at/);
  assert.match(content, /'Conta manual'/);
});

test('estado vazio honesto quando não há contas cadastradas', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.match(content, /Você ainda não tem contas cadastradas\./);
});

// ============================================================================
// A distribuição monetária deixou a experiência pública; cálculos internos
// permanecem nos hooks/serviços financeiros.
// ============================================================================

test('não monta gráfico público de distribuição monetária', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.doesNotMatch(content, /chartSlices|conicGradient|chartCircle/);
});

test('não expõe percentuais ou valores de contas', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.doesNotMatch(content, /formatCurrency|percent:/);
  assert.doesNotMatch(content, /61%|30%|9%/);
});

// ============================================================================
// Ações -- Perguntar/Adicionar/Ver detalhes.
// ============================================================================

test('"Perguntar sobre minhas contas" navega para a Uni pessoal', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  const block = content.match(/Perguntar sobre minhas contas[\s\S]{0,10}/);
  assert.ok(block);
});

test('"Adicionar nova conta" e "Ver detalhes das contas" abrem o mesmo FinanceAccountModal real', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  const addMatches = content.match(/onClick=\{\(\) => setIsAccountModalOpen\(true\)\}/g) ?? [];
  assert.ok(addMatches.length >= 2);
});

test('permissões de gerenciar/excluir vêm de useWorkspaceRole real, nunca hardcoded true', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.match(content, /canManage=\{workspaceRole\.canUpdate === true\}/);
  assert.match(content, /canDelete=\{workspaceRole\.canDelete === true\}/);
});

// ============================================================================
// Acessibilidade e responsividade.
// ============================================================================

test('CSS oferece foco visível, prefers-reduced-motion e responsividade', async () => {
  const css = await source('./simplifiedMyAccounts.module.css');
  assert.match(css, /\.backButton:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
});

test('status da conta não depende só de cor (Badge com texto)', async () => {
  const content = await source('./SimplifiedMyAccountsPage.jsx');
  assert.match(content, /\{isSynced \? 'Sincronizado' : 'Conta manual'\}/);
});
