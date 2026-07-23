import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Prop opcional, sem regressao no comportamento sem simulacao
// ============================================================================

test('comparisonSeries e um prop opcional com valor padrao null', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, /comparisonSeries = null,/);
});

test('sem comparacao (isComparing falso), gráfico usa scenarioIds e chartData originais', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, /scenarioIds\.map\(\(sid\) => \{/);
  assert.match(content, /chartData\s*\n\s*\.map\(\(d, i\) => \{/);
});

test('isComparing so fica ativo quando comparisonSeries e comparavel e tem pontos', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, /const isComparing = Boolean\(comparisonSeries\?\.isComparable && comparisonSeries\.points\?\.length\);/);
});

// ============================================================================
// Modo comparacao: duas series, rotulos textuais, diferenciacao nao so por cor
// ============================================================================

test('em modo comparacao, renderiza exatamente as series realValue e simulatedValue', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, /series: 'realValue', color: COMPARISON_COLORS\.real, dashed: false/);
  assert.match(content, /series: 'simulatedValue', color: COMPARISON_COLORS\.simulated, dashed: true/);
});

test('legenda contem os textos "Real" e "Simulado" (nao apenas cor)', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, />\s*Real\{/);
  assert.match(content, />\s*Simulado\{/);
});

test('serie simulada usa estilo de traco diferente (tracejado), nao depende so da cor', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, /dashed && styles\.lineDashed/);
  assert.match(content, /legendSwatchDashed/);
});

test('nunca usa vermelho como cor padrao da comparacao', async () => {
  const content = await source('FutureChart.jsx');
  assert.doesNotMatch(content, /real:\s*'var\(--uf-red-500\)'|simulated:\s*'var\(--uf-red-500\)'/);
});

// ============================================================================
// Tooltip
// ============================================================================

test('cada ponto de comparacao usa buildComparisonTooltipText para o tooltip nativo', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, /import \{ buildComparisonTooltipText \} from '\.\/futureChartTooltip\.js';/);
  assert.match(content, /<title>\{buildComparisonTooltipText\(point\)\}<\/title>/);
});

// ============================================================================
// Alinhamento: mesmo cenario, mesmo horizonte (vem do adaptador, nao recalculado aqui)
// ============================================================================

test('componente nao chama buildFutureProjections nem buildFutureChartComparison (apenas consome o resultado)', async () => {
  const content = await source('FutureChart.jsx');
  assert.doesNotMatch(content, /buildFutureProjections|buildFutureChartComparison\(/);
});

test('nao importa nem acessa Supabase', async () => {
  const content = await source('FutureChart.jsx');
  assert.doesNotMatch(content, /supabase/i);
});

// ============================================================================
// Robustez de eixo X quando ha apenas 1 ponto comparavel
// ============================================================================

test('scaleX trata o caso de um unico ponto sem dividir por zero', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, /if \(maxIdx === 0\) return MARGIN\.left;/);
});

// ============================================================================
// F5.6 — aria-label/title nao pode dizer "tres cenarios" em modo comparacao
// ============================================================================

test('aria-label e title do svg mudam em modo comparacao (nao mencionam "tres cenarios")', async () => {
  const content = await source('FutureChart.jsx');
  assert.match(content, /isComparing\s*\n\s*\? 'Gráfico comparando a evolução do saldo projetado real e simulado'/);
  assert.match(content, /<title>\{isComparing \? '[^']+' : '[^']+'\}<\/title>/);
});
