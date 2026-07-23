import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// ReportsPage.jsx
// ============================================================================

test('ReportsPage importa e chama useReports (sem parametros extras)', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /import \{ useReports \} from '\.\.\/hooks\/useReports\.js';/);
  assert.match(page, /const \{ isLoading, error, workspaceBalance, snapshot, hasData, refresh \} = useReports\(\);/);
});

test('ReportsPage nao importa mais reports.mock.js', async () => {
  const page = await source('ReportsPage.jsx');
  assert.doesNotMatch(page, /reports\.mock|reportsMock/);
});

test('ReportsPage nao importa nada de features/future', async () => {
  const page = await source('ReportsPage.jsx');
  assert.doesNotMatch(page, /features\/future/);
});

test('ReportsPage nao importa Dashboard nem financialClarityEngine', async () => {
  const page = await source('ReportsPage.jsx');
  assert.doesNotMatch(page, /dashboard\/|financialClarityEngine/);
});

test('ReportsPage usa EvolutionChart real, alimentado por snapshot.monthlySeries', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /import EvolutionChart from '\.\/relatorios\/EvolutionChart\.jsx';/);
  assert.match(page, /<EvolutionChart monthlySeries=\{snapshot\.monthlySeries\} \/>/);
});

test('ReportsPage nao importa nenhuma biblioteca de grafico externa', async () => {
  const page = await source('ReportsPage.jsx');
  assert.doesNotMatch(page, /recharts|d3|victory|echarts|apex/i);
});

// --- estados ------------------------------------------------------------------

test('estado de loading usa skeleton, nao renderiza conteudo real', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /isLoading \? \(/);
  assert.match(page, /styles\.skeletonCard/);
});

test('estado de erro exibe mensagem e botao de retry chamando refresh', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /\) : error \? \(\s*\n\s*<Card padding="lg" role="alert"/);
  assert.match(page, /onClick=\{refresh\}/);
});

test('estado vazio (sem historico) tem mensagem dedicada, sem fabricar dado', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /!hasData \? \(/);
  assert.match(page, /Nenhuma transação encontrada/);
});

test('aviso de historico insuficiente aparece quando ha menos de 2 meses (sem comparacao)', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /const hasComparison = snapshot\.monthlySeries\.length >= 2;/);
  assert.match(page, /!hasComparison \? \(/);
  assert.match(page, /Ainda não há meses suficientes para comparar/);
});

// --- indicadores -----------------------------------------------------------------

test('formatPercent trata null como travessao, nunca fabrica percentual', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /function formatPercent\(value\) \{\s*\n\s*if \(value === null \|\| value === undefined\) return '—';/);
});

test('os 4 indicadores usam os campos reais do snapshot (nenhum numero fixo)', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /snapshot\.balanceEvolution\.percentChange/);
  assert.match(page, /snapshot\.expenseVariation\.percentChange/);
  assert.match(page, /snapshot\.goalsProgress\.averageProgress/);
  assert.match(page, /snapshot\.goalsProgress\.activeGoalsCount/);
  assert.match(page, /snapshot\.attentionSignals\.count/);
});

test('badge de evolucao do saldo usa secondary quando percentChange e null, senao success/danger', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(
    page,
    /snapshot\.balanceEvolution\.percentChange === null\s*\n\s*\? 'secondary'\s*\n\s*: snapshot\.balanceEvolution\.percentChange >= 0\s*\n\s*\? 'success'\s*\n\s*: 'danger'/,
  );
});

test('saldo atual exibido vem de workspaceBalance real (formatCurrency)', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /formatCurrency\(workspaceBalance\)/);
});

// --- sinais de atencao --------------------------------------------------------

test('sinais de atencao listam snapshot.attentionSignals.reasons (rotulos deterministicos, nunca texto gerado)', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /snapshot\.attentionSignals\.reasons\.map/);
  assert.doesNotMatch(page, /uniReading|Leitura da Uni/);
});

test('nao ha secao "Leitura da Uni" nem "Padrões percebidos" com texto fabricado', async () => {
  const page = await source('ReportsPage.jsx');
  assert.doesNotMatch(page, /Leitura da Uni/);
  assert.doesNotMatch(page, /Padrões percebidos/);
  assert.doesNotMatch(page, /Próximo ajuste recomendado/);
});

test('botão "Perguntar à Uni" fica desabilitado com title explicativo (mesmo padrão de outros módulos)', async () => {
  const page = await source('ReportsPage.jsx');
  assert.match(page, /<Button variant="secondary" disabled title="Disponível em breve\.">\s*\n\s*Perguntar à Uni/);
});

// ============================================================================
// src/pages/relatorios/reportsCalculations.js
// ============================================================================

test('reportsCalculations exporta as funcoes publicas aprovadas', async () => {
  const calc = await source('relatorios/reportsCalculations.js');
  assert.match(calc, /export function calcMonthlySeries\(/);
  assert.match(calc, /export function calcMonthlyAverages\(/);
  assert.match(calc, /export function calcPercentChange\(/);
  assert.match(calc, /export function calcBalanceEvolutionIndicator\(/);
  assert.match(calc, /export function calcExpenseVariationIndicator\(/);
  assert.match(calc, /export function calcGoalsProgressIndicator\(/);
  assert.match(calc, /export function calcAttentionSignals\(/);
  assert.match(calc, /export function buildReportsSnapshot\(/);
});

test('reportsCalculations nao importa nada de features/future (checa imports, nao comentarios)', async () => {
  const calc = await source('relatorios/reportsCalculations.js');
  const importLines = calc.match(/^import .+$/gm) ?? [];
  for (const line of importLines) {
    assert.doesNotMatch(line, /features\/future/);
  }
});

test('reportsCalculations nao depende de React nem Supabase', async () => {
  const calc = await source('relatorios/reportsCalculations.js');
  assert.doesNotMatch(calc, /from 'react'|supabaseClient/);
});

test('monthKey extrai a chave YYYY-MM da string diretamente (nunca via new Date(dateValue) para evitar deslocamento de fuso)', async () => {
  const calc = await source('relatorios/reportsCalculations.js');
  const fnBody = calc.slice(calc.indexOf('function monthKey(dateValue) {'), calc.indexOf('function monthLabel'));
  assert.match(fnBody, /function monthKey\(dateValue\) \{/);
  assert.doesNotMatch(fnBody, /return new Date\(dateValue\)|const date = new Date\(dateValue\)/);
});

test('calcPercentChange nunca calcula percentual sobre base zero sem tratamento explicito', async () => {
  const calc = await source('relatorios/reportsCalculations.js');
  assert.match(calc, /if \(previousValue === 0\) \{/);
});

// ============================================================================
// src/hooks/useReports.js
// ============================================================================

test('useReports consome useTransactions, useFinancialBalances e useGoals -- e somente esses 3', async () => {
  const hook = await source('../hooks/useReports.js');
  assert.match(hook, /import \{ useTransactions \} from '\.\/useTransactions\.js';/);
  assert.match(hook, /import \{ useFinancialBalances \} from '\.\/useFinancialBalances\.js';/);
  assert.match(hook, /import \{ useGoals \} from '\.\.\/features\/goals\/useGoals\.js';/);
});

test('useReports nao importa nenhum service novo', async () => {
  const hook = await source('../hooks/useReports.js');
  assert.doesNotMatch(hook, /from '\.\.\/services\/(?!financialDataEvents)/);
});

test('useReports nao contem logica matematica propria -- delega a buildReportsSnapshot', async () => {
  const hook = await source('../hooks/useReports.js');
  assert.match(hook, /import \{ buildReportsSnapshot \} from '\.\.\/pages\/relatorios\/reportsCalculations\.js';/);
  assert.doesNotMatch(hook, /function calc[A-Z]/);
  assert.doesNotMatch(hook, /\.reduce\(/);
});

test('useReports escuta FINANCIAL_DATA_CHANGED_EVENT para manter dados sincronizados', async () => {
  const hook = await source('../hooks/useReports.js');
  assert.match(hook, /FINANCIAL_DATA_CHANGED_EVENT/);
  assert.match(hook, /addEventListener/);
});

test('useReports expoe a API aprovada', async () => {
  const hook = await source('../hooks/useReports.js');
  assert.match(
    hook,
    /return \{\s*\n\s*isLoading,\s*\n\s*error,\s*\n\s*workspaceBalance,\s*\n\s*snapshot,\s*\n\s*hasData: snapshot\.monthlySeries\.length > 0,\s*\n\s*refresh: refreshAll,\s*\n\s*\};/,
  );
});

test('useReports nao importa nada de features/future (checa imports, nao comentarios)', async () => {
  const hook = await source('../hooks/useReports.js');
  const importLines = hook.match(/^import .+$/gm) ?? [];
  for (const line of importLines) {
    assert.doesNotMatch(line, /features\/future/);
  }
});

// ============================================================================
// EvolutionChart.jsx
// ============================================================================

test('EvolutionChart e SVG puro, sem biblioteca de grafico externa', async () => {
  const chart = await source('relatorios/EvolutionChart.jsx');
  assert.match(chart, /<svg/);
  assert.doesNotMatch(chart, /recharts|d3|victory|echarts|apex/i);
});

test('EvolutionChart recebe monthlySeries como prop e nao importa dado mock', async () => {
  const chart = await source('relatorios/EvolutionChart.jsx');
  assert.match(chart, /function EvolutionChart\(\{ monthlySeries \}\)/);
  assert.doesNotMatch(chart, /reports\.mock|reportsMock/);
});
