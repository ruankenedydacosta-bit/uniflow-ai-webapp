import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// Sem infraestrutura de renderização React neste repositório: cobertura por
// leitura de código-fonte para wiring/garantias estruturais, mesmo padrão já
// usado em outras subfases (DashboardPage.test.js, UniChatPage.test.js).

// ============================================================================
// Estado inicial
// ============================================================================

test('estado inicial: painel de simulação comeca fechado', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /const \[isSimulationPanelOpen, setIsSimulationPanelOpen\] = useState\(false\);/);
});

test('estado inicial: botao "Simular cenario" existe e abre o painel', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /Simular cenário/);
  assert.match(page, /onClick=\{handleStartSimulation\}/);
  assert.match(page, /function handleStartSimulation\(\) \{\s*\n\s*setIsSimulationPanelOpen\(true\);/);
});

test('estado inicial: sem simulacao ativa, a pagina exibe as projecoes reais', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /const displayedProjections = simulation\.isActive \? simulation\.simulatedProjections : projections;/);
});

// ============================================================================
// F5.4 — Comparação Real × Simulado
// ============================================================================

test('comparacao so e construida quando a simulacao esta ativa (senao e null)', async () => {
  const page = await source('FuturePage.jsx');
  const comparisonBlock = page.slice(
    page.indexOf('const comparison = simulation.isActive'),
    page.indexOf(': null;') + ': null;'.length,
  );
  assert.match(comparisonBlock, /simulation\.isActive\s*\n\s*\? buildFutureComparison\(\{/);
  assert.match(comparisonBlock, /: null;/);
});

test('comparacao usa exatamente projections (real) e simulation.simulatedProjections (simulado), nunca recalcula', async () => {
  const page = await source('FuturePage.jsx');
  const comparisonBlock = page.slice(
    page.indexOf('const comparison = simulation.isActive'),
    page.indexOf(': null;') + ': null;'.length,
  );
  assert.match(comparisonBlock, /realProjections: projections,/);
  assert.match(comparisonBlock, /simulatedProjections: simulation\.simulatedProjections,/);
  assert.match(comparisonBlock, /selectedHorizon,/);
});

test('FutureComparisonCard e renderizado com a comparacao (o proprio card decide se aparece)', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /import FutureComparisonCard from '\.\/components\/FutureComparisonCard\/FutureComparisonCard';/);
  assert.match(page, /<FutureComparisonCard comparison=\{comparison\} \/>/);
});

test('comparacao nunca chama buildFutureProjections diretamente em FuturePage', async () => {
  const page = await source('FuturePage.jsx');
  assert.doesNotMatch(page, /buildFutureProjections\(/);
});

// ============================================================================
// F5.5 — Comparação gráfica Real × Simulado
// ============================================================================

test('chartComparison so e construido quando a simulacao esta ativa (senao e null)', async () => {
  const page = await source('FuturePage.jsx');
  const chartComparisonBlock = page.slice(
    page.indexOf('const chartComparison = simulation.isActive'),
    page.indexOf(': null;', page.indexOf('const chartComparison = simulation.isActive')) + ': null;'.length,
  );
  assert.match(chartComparisonBlock, /simulation\.isActive\s*\n\s*\? buildFutureChartComparison\(\{/);
  assert.match(chartComparisonBlock, /: null;/);
});

test('chartComparison usa projections (real) e simulation.simulatedProjections (simulado), nunca displayedProjections', async () => {
  const page = await source('FuturePage.jsx');
  const chartComparisonBlock = page.slice(
    page.indexOf('const chartComparison = simulation.isActive'),
    page.indexOf(': null;', page.indexOf('const chartComparison = simulation.isActive')) + ': null;'.length,
  );
  assert.match(chartComparisonBlock, /realProjections: projections,/);
  assert.match(chartComparisonBlock, /simulatedProjections: simulation\.simulatedProjections,/);
  assert.doesNotMatch(chartComparisonBlock, /realProjections: displayedProjections/);
});

test('chartComparison usa o cenario selecionado e o mesmo horizonte da pagina', async () => {
  const page = await source('FuturePage.jsx');
  const chartComparisonBlock = page.slice(
    page.indexOf('const chartComparison = simulation.isActive'),
    page.indexOf(': null;', page.indexOf('const chartComparison = simulation.isActive')) + ': null;'.length,
  );
  assert.match(chartComparisonBlock, /scenarioId: selectedScenario,/);
  assert.match(chartComparisonBlock, /selectedHorizon,/);
});

test('FutureChart recebe comparisonSeries={chartComparison}', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /import \{ buildFutureChartComparison \} from '\.\/futureChartComparison';/);
  assert.match(page, /<FutureChart[\s\S]*?comparisonSeries=\{chartComparison\}[\s\S]*?\/>/);
});

test('o card textual de comparacao (F5.4) continua intacto apos a integracao grafica', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /<FutureComparisonCard comparison=\{comparison\} \/>/);
});

// ============================================================================
// F5.6 — polimento: ordem visual e aviso de dados simulados
// ============================================================================

test('FutureComparisonCard aparece depois do FutureChart (perto do que ela resume), nao antes do resumo/grafico', async () => {
  const page = await source('FuturePage.jsx');
  const chartIndex = page.indexOf('<FutureChart');
  const cardIndex = page.indexOf('<FutureComparisonCard');
  assert.ok(chartIndex >= 0 && cardIndex >= 0);
  assert.ok(cardIndex > chartIndex, 'FutureComparisonCard deve vir depois de FutureChart');
});

test('aviso de dados simulados so aparece quando simulation.isActive, cobrindo resumo/grafico/cenarios/metas', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /\{simulation\.isActive && \(\s*\n\s*<p className=\{styles\.simulationDataNotice\} role="status">/);
  assert.match(page, /refletem a simulação ativa, não seus dados reais\./);
});

test('aviso de dados simulados vem antes do FutureSummary (primeiro elemento do bloco com dados)', async () => {
  const page = await source('FuturePage.jsx');
  const noticeIndex = page.indexOf('simulationDataNotice');
  const summaryIndex = page.indexOf('<FutureSummary');
  assert.ok(noticeIndex >= 0 && summaryIndex >= 0);
  assert.ok(noticeIndex < summaryIndex);
});

// ============================================================================
// Integração com useFutureSimulation (F5.2) — sem duplicar o motor
// ============================================================================

test('FuturePage usa useFutureSimulation, nunca reimplementa a logica de simulacao', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /import \{ useFutureSimulation \} from '\.\/useFutureSimulation';/);
  assert.match(page, /const simulation = useFutureSimulation\(\{/);
  assert.doesNotMatch(page, /monthlyIncomeDelta:\s*avgIncome|buildFutureProjections\(/);
});

test('simulacao usa o mesmo horizonte e os mesmos cenarios da visao real (sem estado duplicado)', async () => {
  const page = await source('FuturePage.jsx');
  const simulationCallBlock = page.slice(
    page.indexOf('const simulation = useFutureSimulation({'),
    page.indexOf('});', page.indexOf('const simulation = useFutureSimulation({')),
  );
  assert.match(simulationCallBlock, /scenarioIds: projections\.availableScenarios,/);
  assert.match(simulationCallBlock, /selectedHorizon,/);
});

// ============================================================================
// F5.3.1 — dados-base compartilhados (sem leitura duplicada)
// ============================================================================

test('FuturePage nao importa mais os hooks financeiros diretamente (baseInputs vem de useFutureData)', async () => {
  const page = await source('FuturePage.jsx');
  assert.doesNotMatch(page, /import \{ useFinancialBalances \}/);
  assert.doesNotMatch(page, /import \{ useTransactions \}/);
  assert.doesNotMatch(page, /import \{ useGoals \}/);
  assert.doesNotMatch(page, /import \{ useSession \}/);
});

test('FuturePage nao chama mais os hooks financeiros duplicados', async () => {
  const page = await source('FuturePage.jsx');
  assert.doesNotMatch(page, /useFinancialBalances\(/);
  assert.doesNotMatch(page, /useTransactions\(/);
  assert.doesNotMatch(page, /useGoals\(/);
});

test('FuturePage extrai baseInputs de useFutureData e passa exatamente ele para a simulacao', async () => {
  const page = await source('FuturePage.jsx');
  const useFutureDataCallBlock = page.slice(
    page.indexOf('const {'),
    page.indexOf('} = useFutureData({') + 1,
  );
  assert.match(useFutureDataCallBlock, /baseInputs,/);

  const simulationCallBlock = page.slice(
    page.indexOf('const simulation = useFutureSimulation({'),
    page.indexOf('});', page.indexOf('const simulation = useFutureSimulation({')),
  );
  assert.match(simulationCallBlock, /\.\.\.baseInputs,/);
});

test('projecao real e simulada derivam do mesmo retorno de useFutureData (mesmo instante de dados)', async () => {
  const page = await source('FuturePage.jsx');
  const useFutureDataIdx = page.indexOf('} = useFutureData({');
  const simulationIdx = page.indexOf('const simulation = useFutureSimulation({');
  assert.ok(useFutureDataIdx !== -1 && simulationIdx !== -1);
  assert.ok(useFutureDataIdx < simulationIdx, 'baseInputs deve ser extraído de useFutureData antes de alimentar a simulação');
});

// ============================================================================
// Saída da simulação
// ============================================================================

test('sair da simulacao reseta overrides, fecha o painel e nao pede confirmacao', async () => {
  const page = await source('FuturePage.jsx');
  const fnBody = page.slice(
    page.indexOf('function handleExitSimulation'),
    page.indexOf('if (isLoading)'),
  );
  assert.match(fnBody, /simulation\.resetSimulation\(\);/);
  assert.match(fnBody, /setIsSimulationPanelOpen\(false\);/);
  assert.match(fnBody, /setSimulationResetKey/);
  assert.doesNotMatch(fnBody, /confirm\(|window\.confirm/);
});

test('painel remonta (key) ao sair, garantindo que rascunhos de texto nao ficam obsoletos', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /<FutureSimulationPanel\s*\n\s*key=\{simulationResetKey\}/);
});

// ============================================================================
// Ausência de histórico
// ============================================================================

test('painel de simulacao fica disponivel mesmo sem historico (ajuste de saldo continua util)', async () => {
  const page = await source('FuturePage.jsx');
  const beforeEmptyState = page.slice(0, page.indexOf('{!hasData ? ('));
  assert.match(beforeEmptyState, /isSimulationPanelOpen \? \(/);
  assert.match(beforeEmptyState, /<FutureSimulationPanel/);
});

test('FutureSimulationPanel recebe hasHistory a partir do hasData real', async () => {
  const page = await source('FuturePage.jsx');
  assert.match(page, /hasHistory=\{hasData\}/);
});

// ============================================================================
// Ausência de integrações fora do escopo
// ============================================================================

test('FuturePage nao integra Dashboard, Uni, localStorage nem chama Supabase diretamente', async () => {
  const page = await source('FuturePage.jsx');
  assert.doesNotMatch(page, /dashboard|uni-chat|uni-llm|localStorage|supabaseClient|useSearchParams/i);
});

test('FuturePage nao introduz nenhuma nova dependencia externa (apenas imports internos e react-router-dom ja usado)', async () => {
  const page = await source('FuturePage.jsx');
  const importLines = page.match(/^import .+$/gm) ?? [];
  for (const line of importLines) {
    assert.match(line, /from '(\.\.?\/|react-router-dom|react)/);
  }
});
