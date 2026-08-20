import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { modeOptions } from './cognitiveLiveChart.mock.js';
import { buildSmoothPath, findNearestIndex, formatBRL } from './cognitiveLiveChart.utils.js';

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
  assert.match(source, /Entradas e Saídas/);
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

test('hasRealData distingue período vazio de período com lançamentos', async () => {
  const { hasRealData } = await import('./cognitiveLiveChart.utils.js');
  assert.equal(hasRealData([{ day: 1, receita: 0, despesa: 0 }, { day: 2, receita: 0, despesa: 0 }]), false);
  assert.equal(hasRealData([{ day: 1, receita: 0, despesa: 0 }, { day: 2, receita: 120, despesa: 0 }]), true);
  assert.equal(hasRealData([]), false);
  assert.equal(hasRealData(undefined), false);
});

test('formatBRL usa moeda brasileira sem casas decimais', () => {
  assert.equal(formatBRL(3200), 'R$ 3.200');
  assert.equal(formatBRL(0), 'R$ 0');
});

test('estado vazio: componente permanece montado com título, legenda, eixos e linha-base, sem marcas de dado', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /isEmptyView/);
  assert.match(source, /emptyBaseline/);
  assert.match(source, /styles\.legend/);
  assert.match(source, /axisLabel/);
  assert.match(source, /emptyOverlayCta/);
  // Nenhuma linha/área/ponto de dado é desenhada quando isEmptyView é verdadeiro.
  assert.match(source, /\{!isEmptyView \? \(\s*<path\s*\n\s*d=\{despesaLinePath\}/);
  assert.match(source, /\{!isEmptyView \? receitaPoints\.map/);
  assert.match(source, /\{!isEmptyView \? despesaPoints\.map/);
});

test('estado vazio: overlay expõe mensagem, apoio e CTA reais recebidos via props (nunca dado inventado)', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /emptyState\.message/);
  assert.match(source, /emptyState\.support/);
  assert.match(source, /emptyState\.ctaLabel && emptyState\.onCtaAction/);
  assert.match(source, /onClick=\{emptyState\.onCtaAction\}/);
});

test('estado vazio: interação de ponteiro/teclado (tooltip) fica desabilitada, pois não há ponto real para focar', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /\{!isEmptyView \? \(\s*<rect/);
  assert.match(source, /tooltipScreen && focusedDataPoint && !isEmptyView/);
});

test('legenda e tooltip aceitam labels PF\\/PJ via seriesLabels sem duplicar o componente', async () => {
  const chart = await featureSource('CognitiveLiveChart.jsx');
  const tooltip = await featureSource('CognitiveChartTooltip.jsx');
  assert.match(chart, /seriesLabels = \{ receita: 'Entradas', despesa: 'Saídas' \}/);
  assert.match(chart, /\{seriesLabels\.receita\} — linha cheia/);
  assert.match(chart, /\{seriesLabels\.despesa\} — linha tracejada/);
  assert.match(tooltip, /seriesLabels\.receita/);
  assert.match(tooltip, /seriesLabels\.despesa/);
});

test('tooltip exibe data, entradas/saídas e resultado do dia formatados em BRL', async () => {
  const tooltip = await featureSource('CognitiveChartTooltip.jsx');
  assert.match(tooltip, /point\.label/);
  assert.match(tooltip, /formatBRL\(point\.receita\)/);
  assert.match(tooltip, /formatBRL\(point\.despesa\)/);
  assert.match(tooltip, /Resultado do dia/);
  assert.match(tooltip, /formatBRL\(result\)/);
});

test('eixo vertical exibe formatação monetária (BRL) nos extremos da escala', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /\{isEmptyView \? formatBRL\(0\) : formatBRL\(yMax\)\}/);
  assert.match(source, /\{formatBRL\(0\)\}/);
});

test('responsividade estrutural: SVG usa viewBox e largura 100%, sem medidas fixas em pixel que gerem corte', async () => {
  const css = await featureSource('CognitiveLiveChart.module.css');
  assert.match(css, /\.svg \{[^}]*width: 100%/);
  assert.match(css, /\.chartWrapper \{[^}]*width: 100%/);
});

test('overlay do estado vazio respeita prefers-reduced-motion (não anima) e usa apenas as variáveis locais do card', async () => {
  const css = await featureSource('CognitiveLiveChart.module.css');
  assert.match(css, /\.emptyOverlay \{/);
  assert.doesNotMatch(css, /\.emptyOverlay[^}]*animation:/);
  assert.match(css, /\.emptyOverlayCta:focus-visible/);
});

test('acessibilidade: descrição textual do gráfico muda para o cenário vazio sem inventar totais', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /const chartDescription = isEmptyView/);
  assert.match(source, /emptyState\.message\} \$\{emptyState\.support/);
});

// ============================================================================
// CHART-PULSE1 -- a "borda branca" ao clicar era o anel de foco padrão do
// navegador sobre o <svg> (que tem tabIndex={0} e onKeyDown de verdade).
// Sai no ponteiro, fica no teclado, e o toque ganha uma onda da marca.
// ============================================================================

test('a borda branca some no CLIQUE/TOQUE -- :focus sem outline', async () => {
  const css = await featureSource('CognitiveLiveChart.module.css');
  assert.match(css, /\.svg:focus \{\s*\n\s*outline: none;\s*\n\s*\}/);
});

// Sem isto, quem navega por teclado ficaria sem saber onde está -- o svg
// continua focável e continua tendo onKeyDown.
test('ACESSIBILIDADE: teclado mantém indicador visível (:focus-visible), na cor da marca', async () => {
  const css = await featureSource('CognitiveLiveChart.module.css');
  const focusVisible = css.slice(css.indexOf('.svg:focus-visible {'), css.indexOf('.rootPulsing {'));
  assert.match(focusVisible, /outline: 2px solid var\(--uni-cyan\);/);
  assert.match(focusVisible, /outline-offset: 3px;/);

  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /tabIndex=\{0\}/, 'o svg continua alcançável por teclado');
  assert.match(source, /onKeyDown=\{handleKeyDown\}/, 'o svg continua navegável por teclado');
});

test('onda usa as três cores da marca (roxo -> azul -> ciano) por token, nunca hex fixo', async () => {
  const css = await featureSource('CognitiveLiveChart.module.css');
  const keyframes = css.slice(css.indexOf('@keyframes uniChartPulse'), css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .rootPulsing'));
  assert.match(keyframes, /var\(--uni-purple\)/);
  assert.match(keyframes, /var\(--uni-blue\)/);
  assert.match(keyframes, /var\(--uni-cyan\)/);
  assert.doesNotMatch(keyframes, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(css, /--uni-cyan: var\(--uf-app-cyan\);/);
});

test('onda se espalha da borda para FORA (box-shadow crescente) e nunca toca o conteúdo interno', async () => {
  const css = await featureSource('CognitiveLiveChart.module.css');
  const keyframes = css.slice(css.indexOf('@keyframes uniChartPulse'), css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .rootPulsing'));
  // Só box-shadow é animado: nada de transform/scale, que mexeria no
  // conteúdo interno do gráfico.
  assert.match(keyframes, /box-shadow:/);
  assert.doesNotMatch(keyframes, /transform:|scale\(|opacity:/);
  // O raio/spread cresce do início para o fim -- é o que dá a onda.
  assert.match(keyframes, /0 0 24px 6px/);
  assert.match(keyframes, /0 0 66px 30px/);
});

test('duração dentro da faixa pedida (800ms-1.2s) e igual no CSS e no JS', async () => {
  const css = await featureSource('CognitiveLiveChart.module.css');
  const source = await featureSource('CognitiveLiveChart.jsx');
  const cssMs = Number(/animation: uniChartPulse (\d+)ms/.exec(css)?.[1]);
  const jsMs = Number(/const PULSE_DURATION_MS = (\d+);/.exec(source)?.[1]);
  assert.ok(cssMs >= 800 && cssMs <= 1200, `duração do CSS fora da faixa: ${cssMs}ms`);
  assert.equal(jsMs, cssMs, 'JS e CSS precisam concordar, senão a onda não reinicia no tempo certo');
});

test('toque dispara a onda e ela REINICIA a cada toque (remove/readiciona no próximo frame)', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  const handler = source.slice(source.indexOf('function handleRootPointerDown'), source.indexOf('return (', source.indexOf('function handleRootPointerDown')));
  assert.match(handler, /setIsPulsing\(false\);/);
  assert.match(handler, /requestAnimationFrame\(\(\) => setIsPulsing\(true\)\);/);
  assert.match(source, /onPointerDown=\{handleRootPointerDown\}/);
});

test('prefers-reduced-motion não recebe onda -- barrado no JS e também no CSS', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  const handler = source.slice(source.indexOf('function handleRootPointerDown'), source.indexOf('return (', source.indexOf('function handleRootPointerDown')));
  assert.match(handler, /if \(reduceMotion\) return;/);
  const css = await featureSource('CognitiveLiveChart.module.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.rootPulsing \{\s*\n\s*animation: none;/);
});

test('o timeout da onda é limpo no unmount -- nunca setState em componente desmontado', async () => {
  const source = await featureSource('CognitiveLiveChart.jsx');
  assert.match(source, /useEffect\(\(\) => \(\) => \{\s*\n\s*if \(pulseTimeoutRef\.current\) clearTimeout\(pulseTimeoutRef\.current\);\s*\n\s*\}, \[\]\);/);
});
