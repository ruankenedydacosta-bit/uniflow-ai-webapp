import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('desktop reaproveita transactionFilterUtils em vez de reimplementar busca/filtro/ordenação', async () => {
  const contents = await source('FinanceTransactionModal.jsx');
  assert.match(contents, /from '\.\/transactionFilterUtils\.js'/);
  assert.match(contents, /applyTransactionFilters/);
  assert.match(contents, /derivePaymentMethodOptions/);
  assert.match(contents, /hasActiveTransactionFilters/);
  assert.match(contents, /filterTransactionsByDateRange/);
  // Nenhuma reimplementação local de comparação/normalização de texto de busca.
  assert.doesNotMatch(contents, /normalize\('NFD'\)/);
});

test('desktop reaproveita getFinancialPeriod (mesma função do seletor de período mobile) para o filtro de período', async () => {
  const contents = await source('FinanceTransactionModal.jsx');
  assert.match(contents, /import \{ getFinancialPeriod \} from '\.\/mobile\/financeiroMobileData\.js'/);
});

test('lista desktop tem busca, botão de filtros e painel com todos os campos do escopo', async () => {
  const contents = await source('FinanceTransactionModal.jsx');
  assert.match(contents, /finance-transaction-list-search/);
  assert.match(contents, /finance-transaction-list-sort/);
  assert.match(contents, /finance-transaction-list-period/);
  assert.match(contents, /finance-transaction-list-type/);
  assert.match(contents, /finance-transaction-list-account/);
  assert.match(contents, /finance-transaction-list-category/);
  assert.match(contents, /finance-transaction-list-payment-method/);
  assert.match(contents, /finance-transaction-list-installment/);
  assert.match(contents, /finance-transaction-list-recurring/);
});

test('lista desktop tem um único botão para limpar filtros, desabilitado sem filtros ativos', async () => {
  const contents = await source('FinanceTransactionModal.jsx');
  const clearButtonMatches = contents.match(/onClick=\{clearListFilters\}/g) ?? [];
  // Um botão dentro do painel de filtros + um atalho dentro do estado vazio, ambos chamando a mesma função.
  assert.equal(clearButtonMatches.length, 2);
  assert.match(contents, /disabled=\{!listHasActiveFilters\}/);
});

test('lista desktop mostra "Nenhuma movimentação encontrada" no estado vazio com filtros ativos', async () => {
  const contents = await source('FinanceTransactionModal.jsx');
  assert.match(contents, /Nenhuma movimentação encontrada\./);
  assert.match(contents, /Nenhum lançamento registrado\./);
});

test('painel de filtros desktop usa o CSS module dedicado (nenhuma classe utilitária inexistente)', async () => {
  const [jsx, css] = await Promise.all([
    source('FinanceTransactionModal.jsx'),
    source('FinanceTransactionModal.module.css'),
  ]);
  assert.match(jsx, /import styles from '\.\/FinanceTransactionModal\.module\.css'/);
  assert.match(jsx, /styles\.filtersPanel/);
  assert.match(css, /\.filtersPanel\s*\{/);
});

test('mobile: classes usadas pelo painel de filtros existem no CSS module (regressão do estado inconsistente encontrado)', async () => {
  const [jsx, css] = await Promise.all([
    source('mobile/components/RecentTransactionsList.jsx'),
    source('mobile/FinanceiroMobile.module.css'),
  ]);
  const usedClasses = new Set(
    [...jsx.matchAll(/financeMobile[A-Za-z]+/g)].map((match) => match[0]),
  );
  for (const className of usedClasses) {
    assert.match(css, new RegExp(`\\.${className}[\\s.{:,)]`), `classe .${className} usada em RecentTransactionsList.jsx mas ausente em FinanceiroMobile.module.css`);
  }
});
