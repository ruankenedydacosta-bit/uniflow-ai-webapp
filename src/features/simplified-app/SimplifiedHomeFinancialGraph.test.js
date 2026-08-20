import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// Verificações de "isto não pode existir no código" precisam olhar só o
// CÓDIGO: os comentários destes arquivos citam de propósito as regras
// antigas (totalByType, margin-inline) para explicar por que sairam, e
// bater nesse texto seria um falso positivo.
const codeOnly = (content) => content
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ============================================================================
// HOME-GRAPH2 -- responsividade, fonte única e redesign da seção abaixo do
// gráfico. O gráfico principal (CognitiveLiveChart) NÃO foi redesenhado.
// ============================================================================

test('continua reutilizando o CognitiveLiveChart existente -- nunca um segundo gráfico', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /import \{ CognitiveLiveChart \} from '\.\.\/cognitive-live-chart\/index\.js';/);
  assert.match(graph, /variant="compact"/);
  assert.match(graph, /defaultMode="overview"/);
});

// ----------------------------------------------------------- RESPONSIVIDADE

test('RESPONSIVIDADE: o teto de largura do gráfico é centralizado -- a sobra nunca cai toda à direita', async () => {
  const css = await source('../cognitive-live-chart/CognitiveLiveChart.module.css');
  assert.match(css, /\.rootCompact \{[\s\S]*?max-width: 430px;[\s\S]*?margin-inline: auto;[\s\S]*?\}/);
  assert.match(css, /\.rootDetailed \{[\s\S]*?max-width: 430px;[\s\S]*?margin-inline: auto;[\s\S]*?\}/);
});

// --------------------------------------------------- LARGURA TOTAL (V2.1)
//
// Medido no navegador ANTES da correção, viewport 480: cards de Entradas/
// Saídas com 428px e o gráfico com 355px -- 40px de vão de cada lado. O
// teto de 430px travava a largura e, pior, `margin-inline: auto` tirava o
// stretch do item flex, encolhendo o card até o conteúdo.

test('LARGURA TOTAL: a Home neutraliza o teto e as margens automáticas do componente compartilhado', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  const rule = /\.chart\.chart \{([\s\S]*?)\}/.exec(css);
  assert.ok(rule, 'a Home precisa de uma regra própria para o gráfico');
  assert.match(rule[1], /max-width: none;/);
  assert.match(rule[1], /margin-inline: 0;/);
  assert.match(rule[1], /width: 100%;/);
  assert.match(rule[1], /align-self: stretch;/);
});

test('LARGURA TOTAL: a regra vence .rootCompact por especificidade, sem !important', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  // Classe repetida = especificidade (0,2,0) > .rootCompact (0,1,0), sem
  // depender da ordem dos arquivos no bundle.
  assert.match(css, /\.chart\.chart \{/);
  assert.doesNotMatch(codeOnly(css), /!important/);
});

test('LARGURA TOTAL: a classe é aplicada só na instância da Home -- dashboard e Financeiro intactos', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /className=\{styles\.chart\}/);
  // O componente compartilhado continua com o teto original para os outros
  // consumidores (dashboard mobile usa compact; Financeiro usa detailed).
  const chartCss = await source('../cognitive-live-chart/CognitiveLiveChart.module.css');
  assert.match(chartCss, /\.rootCompact \{[\s\S]*?max-width: 430px;/);
  const financeiro = await source('../../pages/financeiro/mobile/components/IncomeExpenseChart.jsx');
  assert.doesNotMatch(financeiro, /className=\{styles\.chart\}/);
});

test('LARGURA TOTAL: nenhum breakpoint por aparelho foi criado para resolver a largura', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.doesNotMatch(css, /@media[^{]*\b(390|412|430|480)px/);
});

test('LARGURA TOTAL: o gráfico compartilha a mesma coluna dos cards -- só o padding do card os separa da borda', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  // Gráfico e .totalsRow são irmãos dentro de .card, que tem o único inset
  // horizontal (4px). Nenhum dos dois pode ter inset próprio.
  assert.match(css, /\.card \{[\s\S]*?padding-inline: 4px;/);
  const totalsRow = /\.totalsRow \{([\s\S]*?)\}/.exec(css);
  assert.ok(totalsRow);
  assert.doesNotMatch(totalsRow[1], /margin-inline|max-width|padding-inline/);
});

test('RESPONSIVIDADE: o container do gráfico continua fluido (100%), sem largura fixa por aparelho', async () => {
  const css = await source('../cognitive-live-chart/CognitiveLiveChart.module.css');
  assert.match(css, /\.chartWrapper \{[\s\S]*?width: 100%;/);
  assert.match(css, /\.svg \{[\s\S]*?width: 100%;[\s\S]*?height: auto;/);
  assert.doesNotMatch(css, /@media[^{]*\(width:\s*(390|412|430)px\)/);
});

test('RESPONSIVIDADE: margens simétricas do plot vêm de MARGIN left === right', async () => {
  const chart = await source('../cognitive-live-chart/CognitiveLiveChart.jsx');
  const margin = /const MARGIN = \{ top: (\d+), right: (\d+), bottom: (\d+), left: (\d+) \};/.exec(chart);
  assert.ok(margin, 'MARGIN precisa continuar declarado explicitamente');
  assert.equal(margin[2], margin[4], 'right e left precisam ser iguais');
});

test('RESPONSIVIDADE: rótulo de "hoje" troca de âncora nas bordas -- nunca transborda a viewBox', async () => {
  const chart = await source('../cognitive-live-chart/CognitiveLiveChart.jsx');
  assert.match(chart, /const todayLabelAnchor =/);
  assert.match(chart, /textAnchor=\{todayLabelAnchor\}/);
  assert.doesNotMatch(chart, /x=\{todayX\}[^>]*textAnchor="middle"/);
});

test('RESPONSIVIDADE: nenhum filho da seção soma width:100% com margin lateral (estouro horizontal)', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.doesNotMatch(codeOnly(css), /margin-inline: 4px/, 'margem lateral em filho de largura total estoura o container');
  assert.match(css, /\.card \{[\s\S]*?padding-inline: 4px;[\s\S]*?box-sizing: border-box;/);
  assert.match(css, /\.askUniButton \{[\s\S]*?box-sizing: border-box;/);
});

test('RESPONSIVIDADE: textos longos truncam em vez de quebrar o layout', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.match(css, /\.recentDescription \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.recentMeta \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.totalValueIncome,\s*\n\.totalValueExpense \{[\s\S]*?text-overflow: ellipsis;/);
});

// ------------------------------------------------------------------- DADOS

test('FONTE ÚNICA: a derivação vem de simplifiedRecordsData (mesmas funções de Registros), nunca de matemática própria', async () => {
  const data = await source('./homeFinancialGraphData.js');
  assert.match(
    data,
    /import \{\s*\n\s*filterRecordTransactions,\s*\n\s*getMonthRange,\s*\n\s*summarizeMonth,\s*\n\} from '\.\/simplifiedRecordsData\.js';/,
  );
  assert.doesNotMatch(codeOnly(data), /totalByType|buildCumulativeSeries|financeiroMobileData/);
});

test('FONTE ÚNICA: a busca usa os MESMOS parâmetros de Registros (status completed + categorias personal)', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(graph, /status: 'completed',/);
  assert.match(graph, /useCategories\(\{ workspaceId, context: 'personal' \}\)/);
  assert.match(records, /status: 'completed',/);
  assert.match(records, /context: 'personal',/);
});

test('FONTE ÚNICA: período do gráfico é o mesmo getMonthRange usado por Registros', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /getMonthRange/);
  assert.match(graph, /dateFrom: month\.dateFrom,/);
  assert.match(graph, /dateTo: month\.dateTo,/);
});

test('ATUALIZAÇÃO: três gatilhos complementares (evento, remount e volta do background)', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  const confirmedAction = await source('../../services/confirmedFinancialActionService.js');
  assert.match(graph, /window\.addEventListener\(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged\)/);
  assert.match(graph, /document\.addEventListener\('visibilitychange', handleVisibility\)/);
  assert.match(graph, /document\.visibilityState === 'visible'/);
  assert.match(confirmedAction, /notifyFinancialDataChanged\('confirmed-financial-action'\)/);
});

test('ATUALIZAÇÃO: listener registrado uma única vez (handler em ref), nunca re-inscrito a cada render', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /const refreshRef = useRef\(null\);/);
  assert.match(graph, /refreshRef\.current\?\.\(\)/);
  const effect = /useEffect\(\(\) => \{\s*\n\s*const handleDataChanged[\s\S]*?\}, \[\]\);/.exec(graph);
  assert.ok(effect, 'o efeito do listener precisa ter dependências vazias');
});

test('ATUALIZAÇÃO: ambos os refreshes (transações e categorias) são disparados juntos', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /transactionState\.refresh\(\), categoryState\.refresh\(\)/);
});

// ---------------------------------------------------------------- RECENTES

test('RECENTES: no máximo 2 por tipo, definido na derivação', async () => {
  const data = await source('./homeFinancialGraphData.js');
  assert.match(data, /export function buildRecentMovements\(transactions, categories, type, limit = 2\)/);
  assert.match(data, /\.slice\(0, limit\)/);
});

test('RECENTES: ordem herdada de filterRecordTransactions (mesma ordem visual de Registros)', async () => {
  const data = await source('./homeFinancialGraphData.js');
  assert.match(data, /filterRecordTransactions\(transactions, \{ type, sort: 'recent' \}\)/);
  assert.doesNotMatch(data, /\.sort\(\(.*created_at/);
});

test('RECENTES: são movimentações, com categoria só como metadado -- nunca lista agregada de categorias', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /styles\.recentDescription/);
  assert.match(graph, /movement\.categoryName/);
  assert.doesNotMatch(graph, /buildCategoryBreakdown|categoryView|activeCategories/);
});

test('RECENTES: empty state por tipo, sem dado fictício', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /Nenhuma saída neste período\./);
  assert.match(graph, /Nenhuma entrada neste período\./);
});

test('RECENTES: toggle [Saídas][Entradas] nunca mistura os dois tipos', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /const \[recentView, setRecentView\] = useState\('expense'\);/);
  assert.match(graph, /onClick=\{\(\) => setRecentView\('expense'\)\}/);
  assert.match(graph, /onClick=\{\(\) => setRecentView\('income'\)\}/);
  assert.match(graph, /const activeRecent = graphData\.recent\[recentView\];/);
});

// -------------------------------------------------------------- PERFORMANCE

test('PERFORMANCE: lazy mount por IntersectionObserver preservado', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /rootMargin: '200px 0px'/);
  assert.match(graph, /const \[shouldMount, setShouldMount\] = useState\(false\);/);
  assert.match(graph, /function SimplifiedHomeFinancialGraphContent\(\)/);
});

test('PERFORMANCE: derivação memoizada, nunca recalculada a cada render', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /const graphData = useMemo\(/);
  assert.match(graph, /\[transactionState\.transactions, categoryState\.categories\],/);
});

test('PERFORMANCE: ResizeObserver só atualiza estado quando a largura muda de verdade', async () => {
  const chart = await source('../cognitive-live-chart/CognitiveLiveChart.jsx');
  assert.match(chart, /setContainerWidth\(\(current\) => \(current === nextWidth \? current : nextWidth\)\)/);
});

test('PERFORMANCE: nada de scroll listener nesta seção (o header scroll recém-otimizado não é tocado)', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.doesNotMatch(graph, /addEventListener\('scroll'/);
  assert.doesNotMatch(graph, /requestAnimationFrame/);
});

// --------------------------------------------------------------- REGRESSÃO

test('REGRESSÃO: nenhuma referência pública a Saldo/Patrimônio/Balance nos arquivos da seção', async () => {
  const files = [
    './SimplifiedHomeFinancialGraph.jsx',
    './SimplifiedHomeFinancialGraph.module.css',
  ];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /\bSaldo\b/i, `${file} não pode mencionar Saldo`);
    assert.doesNotMatch(content, /\bPatrim[oô]nio\b/i, `${file} não pode mencionar Patrimônio`);
    assert.doesNotMatch(content, /\bBalance\b/i, `${file} não pode mencionar Balance`);
  }
});

test('REGRESSÃO: useFinancialBalances/useAccounts nunca são importados e o saldo de summarizeMonth nunca é lido', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.doesNotMatch(graph, /useFinancialBalances|useAccounts/);
  const data = await source('./homeFinancialGraphData.js');
  assert.doesNotMatch(data, /\.balance\b/);
});

test('REGRESSÃO: terminologia pública continua Entradas/Saídas, nunca Receita/Despesa', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /Entradas/);
  assert.match(graph, /Saídas/);
  assert.doesNotMatch(graph, />Receita</);
  assert.doesNotMatch(graph, />Despesa</);
});

test('REGRESSÃO: CSS da seção usa só tokens semânticos, nunca hex fixo', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/, 'precisa funcionar em claro/escuro/UniFlow');
});

test('REGRESSÃO: a seção não toca voice, agenda, PWA, billing nem service worker', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.doesNotMatch(graph, /voice|agenda|billing|asaas|serviceWorker|push/i);
});

test('PRIVACIDADE: nenhum log/telemetria com dados financeiros', async () => {
  const files = ['./SimplifiedHomeFinancialGraph.jsx', './homeFinancialGraphData.js'];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /console\.(log|debug|info)\(/, `${file} não deveria logar nada`);
    assert.doesNotMatch(content, /telemetry\.(event|error|metric)\(/, `${file} não deveria enviar telemetria`);
  }
});
