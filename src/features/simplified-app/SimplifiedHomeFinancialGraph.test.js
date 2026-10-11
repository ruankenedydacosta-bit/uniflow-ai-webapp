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
// Redesign (#89): a seção do mês na Home mostra o mês, Entradas/Saídas e a
// barra de quanto do que entrou já saiu. O gráfico e a lista de
// movimentações vivem no Financeiro, não aqui.
// ============================================================================

test('REDESIGN: a seção do mês não desenha gráfico nem lista de movimentações -- isso fica no Financeiro', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.doesNotMatch(graph, /CognitiveLiveChart/);
  assert.doesNotMatch(graph, /recentView|styles\.recentRow|buildRecentMovements/);
  assert.match(graph, /<Link to=\{SIMPLIFIED_ROUTES\.RECORDS\}>Ver Financeiro<\/Link>/);
  assert.match(graph, /\{graphData\.monthTitle \?\? graphData\.periodLabel\}/);
});

test('REDESIGN: a barra de uso vem do ProgressBar base e só aparece quando houve entrada no mês', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /import ProgressBar from '\.\.\/\.\.\/components\/ui\/ProgressBar\/index\.js';/);
  assert.match(graph, /\{usedShare !== null \? \(/);
  assert.match(graph, /<ProgressBar value=\{usedShare\} \/>/);
  assert.match(graph, /Você usou \$\{usedShare\}% do que entrou no mês\./);
});

test('REDESIGN: usedShare é a parte do que entrou que já saiu, inteira, entre 0 e 100, e null sem entrada', async () => {
  const { computeUsedShare } = await import('./homeFinancialGraphData.js');
  assert.equal(computeUsedShare(6500, 2270), 35);
  assert.equal(computeUsedShare(100, 250), 100);
  assert.equal(computeUsedShare(100, -5), 0);
  assert.equal(computeUsedShare(0, 50), null);
  assert.equal(computeUsedShare(undefined, 50), null);
});

test('REDESIGN: o título do mês vem capitalizado ("Outubro") e entra no cache junto com usedShare', async () => {
  const { buildHomeFinancialGraphData } = await import('./homeFinancialGraphData.js');
  const { pickCacheableHomeFinancialData } = await import('./homeFinancialCache.js');
  const data = buildHomeFinancialGraphData({ transactions: [], now: new Date(2026, 9, 23, 12) });
  assert.equal(data.monthTitle, 'Outubro');
  assert.equal(data.usedShare, null);
  const picked = pickCacheableHomeFinancialData(data, 0);
  assert.equal(picked.monthTitle, 'Outubro');
  assert.equal(picked.usedShare, null);
  // Cache de antes do redesign: sem os campos, o JSON continua estável.
  const legacy = pickCacheableHomeFinancialData({
    periodLabel: 'outubro de 2026',
    incomeLabel: 'R$ 0,00',
    expenseLabel: 'R$ 0,00',
  }, 0);
  assert.equal(legacy.monthTitle, null);
  assert.equal(legacy.usedShare, null);
  assert.deepEqual(JSON.parse(JSON.stringify(legacy)), legacy);
});

test('RESPONSIVIDADE: nenhum breakpoint por aparelho foi criado para resolver a largura', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.doesNotMatch(css, /@media[^{]*\b(390|412|430|480)px/);
});

test('RESPONSIVIDADE: os valores truncam em vez de quebrar o layout', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.match(css, /\.totalValueIncome,\s*\n\.totalValueExpense \{[\s\S]*?text-overflow: ellipsis;/);
  assert.match(css, /font-variant-numeric: tabular-nums;/);
});

test('RELATORIO1: o card do Relatório da Uni continua na seção, com a contagem vinda do mesmo graphData', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.doesNotMatch(graph, /Pergunte à Uni sobre seus dados/);
  assert.match(graph, /import SimplifiedReportCard from '\.\/SimplifiedReportCard\.jsx';/);
  // HOME-INSTANT1: a contagem passou a vir do mesmo `graphData` (cache ou
  // fresco) em vez de transactionState -- continua sendo a MESMA busca já
  // feita pela seção, nunca um segundo fetch financeiro só para o card.
  assert.match(graph, /<SimplifiedReportCard transactionCount=\{graphData\.transactionCount\} \/>/);
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

test('FONTE ÚNICA: a busca usa os MESMOS parâmetros de Registros (status completed)', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(graph, /status: 'completed',/);
  assert.match(records, /status: 'completed',/);
  assert.match(records, /context: 'personal',/);
});

test('FONTE ÚNICA: período da seção é o mesmo getMonthRange usado por Registros', async () => {
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

test('ATUALIZAÇÃO: o refresh de transações é disparado pelo handler', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /void transactionState\.refresh\(\);/);
});

// -------------------------------------------------------------- PERFORMANCE

test('PERFORMANCE: lazy mount por IntersectionObserver preservado', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /rootMargin: '200px 0px'/);
  assert.match(graph, /const \[shouldMount, setShouldMount\] = useState\(false\);/);
  assert.match(graph, /function SimplifiedHomeFinancialGraphContent\(\)/);
});

// ============================================================================
// HOME-INSTANT1 -- abrir o app já com os números na tela (cache local) e,
// sem cache, skeleton no lugar de espaço vazio ou de "R$ 0,00" piscando.
// ============================================================================

test('cache é lido de forma SÍNCRONA (useMemo, nunca useEffect) -- os números existem já na primeira renderização', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(
    graph,
    /const cachedData = useMemo\(\s*\n\s*\(\) => readHomeFinancialCache\(\{ userId, workspaceId, periodKey \}\),\s*\n\s*\[userId, workspaceId, periodKey\],\s*\n\s*\);/,
  );
  // Um useEffect só rodaria DEPOIS da primeira pintura -- exatamente o
  // atraso que esta feature existe para eliminar.
  assert.doesNotMatch(graph, /useEffect\(\(\) => \{[\s\S]{0,120}readHomeFinancialCache/);
});

test('enquanto carrega, o último dado visto manda (fresco desta conta, senão o cache); quando os frescos chegam, eles substituem', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /const knownData = lastFresh\?\.workspaceId === workspaceId \? lastFresh\.data : cachedData;/);
  assert.match(graph, /const graphData = isLoadingFinancials \? knownData : freshData;/);
  // Lista vazia por falta de conta (WORKSPACE_REQUIRED) não vira "último dado fresco".
  assert.match(graph, /if \(!isLoadingFinancials && workspaceId && !transactionState\.error && lastFresh\?\.data !== freshData\)/);
});

test('sem nada visto, mostra skeleton -- nunca espaço vazio nem "R$ 0,00" piscando antes do dado real', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /const showSkeleton = !graphData;/);
  assert.match(graph, /if \(showSkeleton\) return <SimplifiedHomeFinancialGraphSkeleton \/>;/);
});

test('skeleton reaproveita as classes de layout da seção real -- o espaço ocupado é o mesmo, nada salta de lugar', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  const skeleton = graph.slice(
    graph.indexOf('function SimplifiedHomeFinancialGraphSkeleton'),
    graph.indexOf('HOME-GRAPH2: conteúdo real'),
  );
  for (const layoutClass of ['styles.card', 'styles.header', 'styles.totalsRow', 'styles.totalCard', 'styles.skeletonBar', 'styles.skeletonReportCard']) {
    assert.ok(skeleton.includes(layoutClass), `skeleton deveria reusar ${layoutClass}`);
  }
  assert.match(skeleton, /role="status"/);
  assert.match(skeleton, /aria-label="Carregando seu fluxo financeiro"/);
});

test('só o último estado REAL é persistido -- nunca um estado ainda carregando', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  const effect = graph.slice(graph.indexOf('if (isLoadingFinancials) return;'), graph.indexOf('if (showSkeleton)'));
  assert.match(effect, /writeHomeFinancialCache\(\{/);
  assert.match(effect, /periodKey,/);
});

test('skeleton usa só tokens semânticos --uf-app-* e respeita movimento reduzido', async () => {
  const css = await source('./SimplifiedHomeFinancialGraph.module.css');
  const skeleton = css.slice(css.indexOf('.skeletonLine {'));
  assert.doesNotMatch(skeleton, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(skeleton, /var\(--uf-app-surface-2\)/);
  assert.match(skeleton, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none;/);
});

test('SEGURANÇA: o logout apaga o cache financeiro do usuário -- nunca vaza números para a próxima conta no mesmo aparelho', async () => {
  const session = await source('../../app/SessionContext.jsx');
  assert.match(session, /import \{ clearHomeFinancialCacheForUser \} from '\.\.\/features\/simplified-app\/homeFinancialCache\.js';/);
  assert.match(session, /clearHomeFinancialCacheForUser\(currentUserId\);/);
});

test('PERFORMANCE: derivação memoizada, nunca recalculada a cada render', async () => {
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  assert.match(graph, /const freshGraphData = useMemo\(/);
  assert.match(graph, /\[transactionState\.transactions\],/);
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
