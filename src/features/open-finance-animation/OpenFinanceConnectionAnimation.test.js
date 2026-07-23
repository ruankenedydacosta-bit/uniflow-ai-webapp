import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ANIMATION_STEPS,
  VARIANT_DURATIONS_MS,
  getTimedSteps,
} from './openFinanceAnimationSteps.js';

const featureSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const appSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('timeline compacta dura 13 segundos e expanded dura 15 segundos', () => {
  assert.equal(VARIANT_DURATIONS_MS.compact, 13000);
  assert.equal(VARIANT_DURATIONS_MS.expanded, 15000);
  assert.equal(getTimedSteps('compact').length, ANIMATION_STEPS.length);
  assert.equal(getTimedSteps('compact').reduce((sum, step) => sum + step.durationMs, 0), 13000);
  assert.equal(getTimedSteps('expanded').reduce((sum, step) => sum + step.durationMs, 0), 15000);
});

test('página Open Finance renderiza a animação expandida entre o herói e os benefícios', async () => {
  const source = await appSource('pages/OpenFinancePage.jsx');
  const hero = source.lastIndexOf('open-finance-title');
  const animation = source.lastIndexOf('<OpenFinanceConnectionAnimation');
  const benefits = source.lastIndexOf('className={styles.benefits}');

  assert.ok(hero >= 0 && hero < animation && animation < benefits);
  assert.match(source, /variant="expanded"/);
  assert.match(source, /autoPlay/);
});

test('página Open Finance mantém a mensagem "Em breve"', async () => {
  const source = await appSource('pages/OpenFinancePage.jsx');
  assert.match(source, /Em breve/);
});

test('selo Em breve permanece no shell da animação', async () => {
  const source = await featureSource('OpenFinanceConnectionAnimation.jsx');
  const badge = source.indexOf('<span className={styles.badge}>Em breve</span>');
  const layers = source.indexOf('ANIMATION_STEPS.map');
  assert.ok(badge >= 0 && badge < layers);
});

test('Ver mais abre painel estático sem repetir a animação', async () => {
  const [page, panel] = await Promise.all([
    appSource('pages/OpenFinancePage.jsx'),
    featureSource('OpenFinanceLearnMorePanel.jsx'),
  ]);

  assert.match(page, /onLearnMore=\{\(\) => setLearnMoreOpen\(true\)\}/);
  assert.match(page, /<OpenFinanceLearnMorePanel/);
  assert.doesNotMatch(panel, /OpenFinanceConnectionAnimation|autoPlay|ANIMATION_STEPS/);
  assert.match(panel, /Como vai funcionar/);
});

test('dialog fecha por Escape, prende foco, restaura o acionador e oferece Entendi', async () => {
  const panel = await featureSource('OpenFinanceLearnMorePanel.jsx');
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /event\.key === 'Escape'/);
  assert.match(panel, /querySelectorAll\('button:not\(\[disabled\]\)'\)/);
  assert.match(panel, /return \(\) => opener\?\.focus/);
  assert.match(panel, />\s*Entendi\s*</);
});

test('Theme System fornece o tema efetivo sem resolvedor concorrente', async () => {
  const [page, animation, panel] = await Promise.all([
    appSource('pages/OpenFinancePage.jsx'),
    featureSource('OpenFinanceConnectionAnimation.jsx'),
    featureSource('OpenFinanceLearnMorePanel.jsx'),
  ]);

  assert.match(page, /const \{ effectiveTheme \} = useTheme\(\)/);
  assert.equal((page.match(/theme=\{effectiveTheme\}/g) ?? []).length, 2);
  assert.match(animation, /data-theme=\{theme\}/);
  assert.match(panel, /data-theme=\{theme\}/);
  assert.doesNotMatch(`${animation}\n${panel}`, /prefers-color-scheme: dark/);
});

test('movimento reduzido e pausa fora do viewport são preservados', async () => {
  const [source, css] = await Promise.all([
    featureSource('OpenFinanceConnectionAnimation.jsx'),
    featureSource('OpenFinanceConnectionAnimation.module.css'),
  ]);

  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /!playing \|\| !isInViewport \|\| reducedMotion/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none !important/);
});

test('feature permanece mockada, genérica e sem conexão externa', async () => {
  const files = await Promise.all([
    featureSource('OpenFinanceConnectionAnimation.jsx'),
    featureSource('OpenFinanceLearnMorePanel.jsx'),
    featureSource('openFinanceAnimationSteps.js'),
  ]);
  const source = files.join('\n');

  assert.doesNotMatch(source, /fetch\(|axios|XMLHttpRequest|https?:\/\/|supabase/i);
  assert.doesNotMatch(source, /client_secret|api[_-]?key|access[_-]?token/i);
  assert.doesNotMatch(source, /Santander|Nubank|Itaú|Bradesco|Banco do Brasil/i);
  assert.match(source, /Banco A/);
});
