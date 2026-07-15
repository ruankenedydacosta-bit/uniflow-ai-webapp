import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { modeOptions } from './cognitiveLiveChart.mock.js';
import { buildSmoothPath, findNearestIndex } from './cognitiveLiveChart.utils.js';

const featureSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const appSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('catálogo expõe os quatro modos aprovados', () => {
  assert.deepEqual(modeOptions.map(({ value }) => value), [
    'overview',
    'uni-insight',
    'comparison',
    'forecast',
  ]);
});

test('compact e detailed usam o mesmo componente-base', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /variant = 'compact'/);
  assert.match(source, /variant === 'detailed'/);
  assert.equal((source.match(/function CognitiveLiveChart|export default function CognitiveLiveChart/g) ?? []).length, 1);
});

test('paths SVG e busca de ponto permanecem determinísticos', () => {
  const points = [{ x: 0, y: 10 }, { x: 20, y: 5 }, { x: 40, y: 8 }];
  assert.match(buildSmoothPath(points), /^M 0 10 C /);
  assert.equal(findNearestIndex(points, 18), 1);
});

test('tooltip possui interação por ponteiro e teclado', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /onPointerDown/);
  assert.match(source, /onPointerCancel/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /Escape/);
});

test('gráfico possui fallback textual acessível', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /role="img"/);
  assert.match(source, /<title>/);
  assert.match(source, /<desc>/);
  assert.match(source, /aria-label=\{chartDescription\}/);
});

test('movimento reduzido desativa animações e transições', async () => {
  const css = await featureSource('CognitiveLiveChart.module.css');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none/);
  assert.match(css, /transition: none/);
});

test('Home renderiza compact entre próximo passo e resumo', async () => {
  const source = await appSource('features/dashboard/mobile/MobileHomeView.jsx');
  const nextStep = source.lastIndexOf('<NextStepCard');
  const chart = source.lastIndexOf('<CognitiveLiveChart');
  const summary = source.lastIndexOf('<FinancialSummaryStrip');
  assert.ok(nextStep >= 0 && nextStep < chart && chart < summary);
  assert.match(source, /variant="compact"/);
  assert.match(source, /Receitas e Despesas/);
});

test('Financeiro usa somente um Cognitive Live Chart detailed', async () => {
  const view = await appSource('pages/financeiro/mobile/MobileFinanceiroView.jsx');
  const chart = await appSource('pages/financeiro/mobile/components/IncomeExpenseChart.jsx');
  assert.equal((view.match(/<IncomeExpenseChart/g) ?? []).length, 1);
  assert.equal((chart.match(/<CognitiveLiveChart/g) ?? []).length, 1);
  assert.match(chart, /variant="detailed"/);
  assert.doesNotMatch(chart, /<svg|<polyline/);
});

test('desktop mantém seus gráficos e composição anteriores', async () => {
  const page = await appSource('pages/FinanceiroPage.jsx');
  assert.match(page, /<FinanceProjectionChart/);
  assert.match(page, /className=\{styles\.page\}/);
  assert.doesNotMatch(page, /CognitiveLiveChart/);
});

test('botão central continua levando exclusivamente à Uni', async () => {
  const center = await appSource('layouts/mobile-app-shell/UniCenterButton.jsx');
  const navigation = await appSource('layouts/mobile-app-shell/BottomNavigation.jsx');
  assert.match(center, /path = '\/uni-ai'/);
  assert.match(center, /aria-label="Conversar com a Uni"/);
  assert.match(navigation, /<UniCenterButton/);
  assert.doesNotMatch(center, /financeiro|quick|lançamento/i);
});

test('feature não contém integrações externas ou biblioteca de gráfico', async () => {
  const files = await Promise.all([
    featureSource('CognitiveLiveChart.jsx'),
    featureSource('cognitiveLiveChart.mock.js'),
    featureSource('cognitiveLiveChart.utils.js'),
  ]);
  assert.doesNotMatch(files.join('\n'), /fetch\(|axios|supabase|openai|elevenlabs|recharts|chart\.js/i);
});
