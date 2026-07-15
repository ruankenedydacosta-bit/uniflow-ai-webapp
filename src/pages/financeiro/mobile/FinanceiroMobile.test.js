import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { financeiroMobileMock } from './financeiroMobile.mock.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('mock financeiro mobile é profundamente imutável', () => {
  assert.equal(Object.isFrozen(financeiroMobileMock), true);
  assert.equal(Object.isFrozen(financeiroMobileMock.periods), true);
  assert.equal(Object.isFrozen(financeiroMobileMock.periods[0].accounts[0]), true);
});

test('seções seguem a ordem executiva definida', async () => {
  const contents = await source('MobileFinanceiroView.jsx');
  const sections = ['PeriodSelectorBar', 'PeriodInsightText', 'AvailableBalanceCard', 'IncomeExpenseChart', 'AccountsCarousel', 'CardsWalletCarousel', 'RecentTransactionsList', 'CategoriesBreakdown', 'FinancialForecastCard', 'financeMobileFab'];
  const positions = sections.map((section) => contents.lastIndexOf(section.startsWith('finance') ? section : `<${section}`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('período controla um snapshot único para todas as seções', async () => {
  const contents = await source('MobileFinanceiroView.jsx');
  assert.match(contents, /const period = financeiroMobileMock\.periods\[periodIndex\]/);
  assert.match(contents, /setPeriodIndex/);
  assert.match(contents, /period\.accounts/);
  assert.match(contents, /period\.transactions/);
});

test('gráfico SVG usa o snapshot do período sem dependência externa', async () => {
  const contents = await source('components/IncomeExpenseChart.jsx');
  assert.match(contents, /<svg/);
  assert.match(contents, /<polyline/);
  assert.match(contents, /chart\.income/);
  assert.match(contents, /chart\.expense/);
  assert.doesNotMatch(contents, /chart\.js|recharts|fetch\(/i);
});

test('ações rápidas expõem as três escolhas financeiras', async () => {
  const contents = await source('components/QuickActionSheet.jsx');
  assert.match(contents, /Registrar receita/);
  assert.match(contents, /Registrar despesa/);
  assert.match(contents, /Fazer transferência/);
  assert.match(contents, /aria-modal="true"/);
});

test('estados loading e vazio possuem caminhos explícitos', async () => {
  const contents = await source('MobileFinanceiroView.jsx');
  assert.match(contents, /viewState === 'loading'/);
  assert.match(contents, /FinanceiroSectionSkeleton/);
  assert.match(contents, /viewState === 'empty'/);
  assert.match(contents, /FinanceiroEmptyState/);
});

test('CSS cobre mobile, safe area, toque, dark tokens e movimento reduzido', async () => {
  const contents = await source('FinanceiroMobile.module.css');
  assert.match(contents, /max-width: 767px/);
  assert.match(contents, /max-width: 359px/);
  assert.match(contents, /min-width: 390px/);
  assert.match(contents, /min-width: 430px/);
  assert.match(contents, /safe-area-inset-bottom/);
  assert.match(contents, /var\(--uf-tap-target-min\)/);
  assert.match(contents, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(contents, /#[0-9a-f]{3,8}/i);
});

test('camada mobile permanece estática e sem integrações', async () => {
  const contents = await Promise.all(['MobileFinanceiroView.jsx', 'financeiroMobile.mock.js', 'components/RecentTransactionsList.jsx'].map(source));
  assert.doesNotMatch(contents.join('\n'), /supabase|fetch\(|axios|openai|elevenlabs/i);
});
