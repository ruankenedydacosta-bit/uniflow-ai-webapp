import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { homeMobileMock } from './homeMobile.mock.js';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('mock mobile é profundamente imutável', () => {
  assert.equal(Object.isFrozen(homeMobileMock), true);
  assert.equal(Object.isFrozen(homeMobileMock.summary), true);
  assert.equal(Object.isFrozen(homeMobileMock.goals[0]), true);
  assert.equal(Object.isFrozen(homeMobileMock.quickActions), true);
});

test('Home mantém as sete seções na ordem oficial', async () => {
  const contents = await source('MobileHomeView.jsx');
  const sections = [
    'UniBriefingCard',
    'NextStepCard',
    'CognitiveLiveChart',
    'FinancialSummaryStrip',
    'GoalsProgressList',
    'InsightCarousel',
    'QuickActionsGrid',
  ];
  const positions = sections.map((name) => contents.lastIndexOf(`<${name}`));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('loading preserva sete espaços sem salto de ordem', async () => {
  const contents = await source('MobileHomeView.jsx');
  assert.match(contents, /SKELETON_SECTIONS/);
  assert.match(contents, /HomeSectionSkeleton/);
  assert.equal(contents.match(/\['(?:briefing|next-step|chart|summary|goals|insights|actions)'/g)?.length, 7);
});

test('briefing e próximo passo possuem fallback útil', async () => {
  const briefing = await source('components/UniBriefingCard.jsx');
  const nextStep = await source('components/NextStepCard.jsx');

  assert.match(briefing, /Uni Briefing/);
  assert.match(briefing, /Ainda estou conhecendo sua rotina/);
  assert.match(nextStep, /Que tal registrar sua primeira receita/);
});

test('resumo distingue ausência de dado de zero financeiro', async () => {
  const contents = await source('components/FinancialSummaryStrip.jsx');
  assert.match(contents, /sem dados ainda/);
  assert.match(contents, /EMPTY_METRICS/);
  assert.match(contents, /metric\.hasData/);
  assert.doesNotMatch(contents, /R\$ 0,00/);
});

test('objetivos têm progresso acessível e estado vazio acionável', async () => {
  const contents = await source('components/GoalsProgressList.jsx');
  assert.match(contents, /role="progressbar"/);
  assert.match(contents, /aria-valuenow/);
  assert.match(contents, /Criar minha primeira meta/);
});

test('insights vazios ocultam a seção inteira', async () => {
  const contents = await source('components/InsightCarousel.jsx');
  assert.match(contents, /if \(!insights\.length\) return null/);
});

test('CSS cobre 320 a 430, toque, ordem e redução de movimento', async () => {
  const contents = await source('HomeMobile.module.css');
  assert.match(contents, /max-width: 767px/);
  assert.match(contents, /max-width: 359px/);
  assert.match(contents, /min-width: 390px/);
  assert.match(contents, /min-width: 430px/);
  assert.match(contents, /var\(--uf-tap-target-min\)/);
  assert.match(contents, /prefers-reduced-motion: reduce/);
});

test('Home mobile permanece local, mockada e sem integrações externas', async () => {
  const files = await Promise.all([
    source('MobileHomeView.jsx'),
    source('homeMobile.mock.js'),
    source('components/UniBriefingCard.jsx'),
    source('components/QuickActionsGrid.jsx'),
  ]);
  const contents = files.join('\n');

  assert.doesNotMatch(contents, /supabase|fetch\(|axios|openai|elevenlabs/i);
  assert.match(contents, /onNavigate/);
});
