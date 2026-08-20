import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// HOME-GRAPH1 -- reintegração do gráfico financeiro antigo (auditoria:
// src/features/cognitive-live-chart/, já ativo em Financeiro mobile, nunca
// redesenhado do zero) na Home, abaixo da área da Uni.
// ============================================================================

test('reutiliza o CognitiveLiveChart existente -- nunca uma segunda implementação de gráfico', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /import \{ CognitiveLiveChart \} from '\.\.\/cognitive-live-chart\/index\.js';/);
  assert.match(graph, /<CognitiveLiveChart/);
  assert.match(graph, /variant="compact"/);
  assert.match(graph, /defaultMode="overview"/);
});

test('fonte única de dados: reaproveita useTransactions/useCategories (mesmos hooks de Registros/Financeiro), nunca um segundo fetch/estado', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /import \{ useCategories, useTransactions \} from '\.\.\/\.\.\/hooks';/);
  assert.match(graph, /useTransactions\(\{/);
  assert.match(graph, /useCategories\(\{ workspaceId \}\)/);
});

test('reaproveita a matemática de período/série já existente em financeiroMobileData.js -- nunca duplicada', async () => {
  const graphData = await source('./homeFinancialGraphData.js');
  assert.match(
    graphData,
    /import \{\s*\n\s*buildCumulativeSeries,\s*\n\s*getFinancialPeriod,\s*\n\s*selectPeriodTransactions,\s*\n\s*totalByType,\s*\n\s*\} from '\.\.\/\.\.\/pages\/financeiro\/mobile\/financeiroMobileData\.js';/,
  );
  const financeiroData = await source('../../pages/financeiro/mobile/financeiroMobileData.js');
  assert.match(financeiroData, /export function buildCumulativeSeries\(/);
  assert.match(financeiroData, /export function selectPeriodTransactions\(/);
  assert.match(financeiroData, /export function totalByType\(/);
});

test('atualiza sozinho após confirmação de movimentação: escuta FINANCIAL_DATA_CHANGED_EVENT (mesmo evento que a confirmação da Uni dispara)', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  const confirmedAction = await source('../../services/confirmedFinancialActionService.js');
  assert.match(graph, /import \{ FINANCIAL_DATA_CHANGED_EVENT \} from '\.\.\/\.\.\/services\/financialDataEvents\.js';/);
  assert.match(graph, /window\.addEventListener\(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged\)/);
  assert.match(graph, /transactionState\.refresh\(\), categoryState\.refresh\(\)/);
  assert.match(confirmedAction, /notifyFinancialDataChanged/);
});

test('lazy mount via IntersectionObserver -- hooks de fetch só rodam quando o conteúdo de verdade monta, nunca antes', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /typeof IntersectionObserver === 'undefined'/);
  assert.match(graph, /rootMargin: '200px 0px'/);
  assert.match(graph, /const \[shouldMount, setShouldMount\] = useState\(false\);/);
  assert.match(
    graph,
    /\{shouldMount \? \(\s*\n\s*<div className=\{styles\.enter\}>\s*\n\s*<SimplifiedHomeFinancialGraphContent \/>/,
  );
  // O componente PESADO (com os hooks de fetch) só existe separado do
  // wrapper -- prova que os hooks não rodam antes do mount real.
  assert.match(graph, /function SimplifiedHomeFinancialGraphContent\(\)/);
  assert.match(graph, /function SimplifiedHomeFinancialGraph\(\)/);
});

test('SimplifiedHomeView renderiza o gráfico DEPOIS de "pronta para ajudar" (availabilityCard), nunca acima/colado na esfera da Uni', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /import SimplifiedHomeFinancialGraph from '\.\/SimplifiedHomeFinancialGraph\.jsx';/);
  const availabilityIndex = home.indexOf('styles.availabilityCard');
  const uniActionIndex = home.indexOf('styles.uniAction');
  const graphIndex = home.indexOf('<SimplifiedHomeFinancialGraph />');
  assert.ok(availabilityIndex > -1 && uniActionIndex > -1 && graphIndex > -1);
  assert.ok(uniActionIndex < availabilityIndex, 'a esfera da Uni precisa vir antes da availabilityCard');
  assert.ok(availabilityIndex < graphIndex, 'o gráfico precisa vir DEPOIS de "pronta para ajudar", nunca antes/colado');
});

test('espaço de respiro entre "pronta para ajudar" e o gráfico fica entre 32-56px', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.match(css, /\.wrapper \{[\s\S]*?margin-top: clamp\(32px, 8vw, 56px\);/);
});

// ============================================================================
// REGRA CRÍTICA -- Saldo não existe mais na UI. Auditoria de regressão.
// ============================================================================

test('AUDITORIA DE REGRESSÃO: nenhuma referência pública a Saldo/Patrimônio/Balance em nenhum arquivo novo', async () => {
  const files = [
    './SimplifiedHomeFinancialGraph.jsx',
    './SimplifiedHomeFinancialGraph.module.css',
    './homeFinancialGraphData.js',
  ];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /\bSaldo\b/i, `${file} não pode mencionar Saldo`);
    assert.doesNotMatch(content, /\bPatrim[oô]nio\b/i, `${file} não pode mencionar Patrimônio`);
    assert.doesNotMatch(content, /\bBalance\b/i, `${file} não pode mencionar Balance`);
    assert.doesNotMatch(content, /\bworkspaceBalance\b/, `${file} não pode usar workspaceBalance`);
    assert.doesNotMatch(content, /\baccountBalances\b/, `${file} não pode usar accountBalances`);
  }
});

test('AUDITORIA DE REGRESSÃO: usa Entradas/Saídas na UI pública, nunca "Receita"/"Despesa"', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, />Entradas</);
  assert.match(graph, />Saídas</);
  assert.doesNotMatch(graph, />Receita</);
  assert.doesNotMatch(graph, />Despesa</);
});

test('useFinancialBalances/useAccounts NUNCA são importados -- o gráfico não precisa de saldo para existir', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.doesNotMatch(graph, /useFinancialBalances|useAccounts/);
});

// ============================================================================
// Categorias -- regra de zero, toggle Saídas/Entradas, touch target.
// ============================================================================

test('toggle [Saídas][Entradas] com destino claro (categoryView), nunca misturando os dois tipos na mesma lista', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /const \[categoryView, setCategoryView\] = useState\('expense'\);/);
  assert.match(graph, /onClick=\{\(\) => setCategoryView\('expense'\)\}/);
  assert.match(graph, /onClick=\{\(\) => setCategoryView\('income'\)\}/);
  assert.match(graph, /const activeCategories = graphData\.categories\[categoryView\];/);
});

test('linha de categoria tem min-height 44px (touch target)', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.match(css, /\.categoryRow \{[\s\S]*?min-height: 44px;/);
});

test('nomes de categoria truncam (ellipsis) -- layout não quebra com nomes longos', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.match(css, /\.categoryName \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
});

// ============================================================================
// Uni contextual -- reaproveita o fluxo existente, nunca um segundo cérebro.
// ============================================================================

test('CTA "Pergunte à Uni" usa o MESMO padrão de navegação já usado em todo o app (navigate(SIMPLIFIED_ROUTES.UNI)) -- nunca um chat/segunda IA novos', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /import \{ SIMPLIFIED_ROUTES \} from '\.\/simplifiedRoutes\.js';/);
  assert.match(graph, /const goToUni = \(\) => navigate\(SIMPLIFIED_ROUTES\.UNI\);/);
  assert.match(graph, /Pergunte à Uni sobre seus dados/);
  // Nunca uma nova função de query/resposta financeira no frontend.
  assert.doesNotMatch(graph, /resolveFinancialIntent|executeFinancialQuery|planFinancialQuery/);
});

test('símbolo da Uni no CTA reaproveita o UniMark oficial -- nunca uma segunda interpretação da marca', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /import \{ UniMark \} from '\.\/SimplifiedIcons\.jsx';/);
  assert.match(graph, /<UniMark \/>/);
});

// ============================================================================
// Tema claro -- o card antigo era hardcoded só-escuro (auditoria); corrigido.
// ============================================================================

test('CORREÇÃO DE TEMA: as 9 custom properties do card usam tokens semânticos (--uf-app-*), nunca hex fixo', async () => {
  const css = await source('../cognitive-live-chart/CognitiveLiveChart.module.css');
  const rootBlock = css.slice(css.indexOf('.root {'), css.indexOf('position: relative;'));
  assert.doesNotMatch(rootBlock, /#[0-9a-fA-F]{3,8}/, 'nenhuma cor hex fixa deveria sobrar nas 9 custom properties');
  assert.match(rootBlock, /--uni-bg-0: var\(--uf-app-canvas\);/);
  assert.match(rootBlock, /--uni-text-primary: var\(--uf-app-text\);/);
  assert.match(rootBlock, /--uni-blue: var\(--uf-app-primary\);/);
  assert.match(rootBlock, /--uni-purple: var\(--uf-app-ai\);/);
  assert.match(rootBlock, /--uni-green: var\(--uf-app-success\);/);
  assert.match(rootBlock, /--uni-red: var\(--uf-app-danger\);/);
});

test('CORREÇÃO DE TEMA: o gradiente de fundo do card não hardcoda mais uma cor -- usa as custom properties (reage ao tema)', async () => {
  const css = await source('../cognitive-live-chart/CognitiveLiveChart.module.css');
  assert.match(css, /radial-gradient\(120% 140% at 15% 0%, var\(--uni-bg-1\) 0%, var\(--uni-bg-0\) 72%\)/);
});

test('CSS novo do card da Home usa só tokens semânticos --uf-app-*, nunca hex fixo', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/, 'nenhuma cor hex fixa -- precisa funcionar em claro/escuro/UniFlow');
});

// ============================================================================
// Privacidade -- nunca telemetria/log com dados financeiros pessoais.
// ============================================================================

test('nenhuma chamada de telemetria/console.log com dados financeiros nos arquivos novos', async () => {
  const files = ['./SimplifiedHomeFinancialGraph.jsx', './homeFinancialGraphData.js'];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /console\.(log|debug|info)\(/, `${file} não deveria logar nada`);
    assert.doesNotMatch(content, /telemetry\.(event|error|metric)\(/, `${file} não deveria enviar telemetria de dados financeiros`);
  }
});
