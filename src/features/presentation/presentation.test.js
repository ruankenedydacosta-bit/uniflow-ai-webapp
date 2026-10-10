import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PRESENTATION_DEMO_USER_ID,
  PRESENTATION_NEXT_ROUTE,
  PRESENTATION_ROUTE,
  PRESENTATION_SLIDES,
  resolvePresentationUserId,
} from './presentationConfig.js';
import {
  clampPresentationIndex,
  getAdjacentPresentationIndex,
  getSwipeDirection,
} from './presentationNavigation.js';
import {
  getPresentationStorageKey,
  isPresentationCompleted,
  markPresentationCompleted,
} from './presentationStorage.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('apresentação possui exatamente os três slides aprovados na ordem correta', () => {
  assert.equal(PRESENTATION_SLIDES.length, 3);
  assert.deepEqual(
    PRESENTATION_SLIDES.map((slide) => slide.id),
    ['welcome', 'everything', 'security'],
  );
  assert.equal(PRESENTATION_SLIDES[0].title, 'Bem-vindo à UniFlow AI');
  assert.equal(PRESENTATION_SLIDES[1].title, 'Tudo em um só lugar');
  assert.equal(PRESENTATION_SLIDES[2].title, 'Seus dados protegidos');
});

test('configuração centraliza rota da apresentação e fallback temporário da Etapa 3', () => {
  assert.equal(PRESENTATION_ROUTE, '/apresentacao');
  assert.equal(PRESENTATION_NEXT_ROUTE, '/plano-pessoal');
});

test('navegação limita índices e suporta avanço e retorno', () => {
  assert.equal(clampPresentationIndex(-1), 0);
  assert.equal(clampPresentationIndex(9), 2);
  assert.equal(getAdjacentPresentationIndex(0, 1), 1);
  assert.equal(getAdjacentPresentationIndex(1, 1), 2);
  assert.equal(getAdjacentPresentationIndex(2, 1), 2);
  assert.equal(getAdjacentPresentationIndex(2, -1), 1);
});

test('swipe horizontal exige deslocamento intencional', () => {
  assert.equal(getSwipeDirection(300, 220), 1);
  assert.equal(getSwipeDirection(100, 180), -1);
  assert.equal(getSwipeDirection(100, 130), 0);
  assert.equal(getSwipeDirection(undefined, 130), 0);
});

test('conclusão persiste isolada por usuário e não vaza após logout/troca de conta', () => {
  const storage = createStorage();
  assert.equal(markPresentationCompleted('user-a', storage), true);
  assert.equal(isPresentationCompleted('user-a', storage), true);
  assert.equal(isPresentationCompleted('user-b', storage), false);
  assert.notEqual(
    getPresentationStorageKey('user-a'),
    getPresentationStorageKey('user-b'),
  );
  assert.equal(isPresentationCompleted(null, storage), false);
});

test('storage indisponível falha de forma segura sem bloquear a jornada', () => {
  const unavailableStorage = {
    getItem() { throw new Error('unavailable'); },
    setItem() { throw new Error('unavailable'); },
  };
  assert.equal(isPresentationCompleted('user-a', unavailableStorage), false);
  assert.equal(markPresentationCompleted('user-a', unavailableStorage), false);
});

test('identidade de persistência usa sessão real e namespace demo separado', () => {
  assert.equal(
    resolvePresentationUserId({ user: { id: 'authenticated-user' } }, true),
    'authenticated-user',
  );
  assert.equal(resolvePresentationUserId(null, true), null);
  assert.equal(resolvePresentationUserId(null, false), PRESENTATION_DEMO_USER_ID);
});

test('carrossel implementa botões, indicadores, teclado, swipe e conclusão idempotente', async () => {
  const contents = await source('./PresentationCarousel.jsx');
  assert.match(contents, /activeSlide\.primaryAction/);
  assert.match(contents, /activeSlide\.skipAction/);
  assert.match(contents, /Voltar ao slide anterior/);
  assert.match(contents, /event\.key === 'ArrowRight'/);
  assert.match(contents, /event\.key === 'ArrowLeft'/);
  assert.match(contents, /onPointerDown=\{handlePointerDown\}/);
  assert.match(contents, /getSwipeDirection/);
  assert.match(contents, /completingRef\.current/);
  assert.match(contents, /aria-current=\{index === activeIndex \? 'step'/);
});

// Tela 21a–c: botões em caixa normal.
test('Começar e Próximo avançam; Pular e Começar agora concluem', async () => {
  const carousel = await source('./PresentationCarousel.jsx');
  const config = await source('./presentationConfig.js');
  assert.match(config, /primaryAction: 'Começar'/);
  assert.match(config, /primaryAction: 'Próximo'/);
  assert.match(config, /primaryAction: 'Começar agora'/);
  assert.equal((config.match(/skipAction: 'Pular'/g) ?? []).length, 2);
  assert.match(carousel, /if \(isLast\) \{\s*completePresentation\(\)/);
  assert.match(carousel, /onClick=\{completePresentation\}/);
});

// Tela 21a–c: a marca do topo é o símbolo oficial do app e a arte usa peças
// reais (orb da Uni, rascunho e agenda, escudo), nunca captura de tela.
test('marca oficial no topo e arte feita com peças do app, sem captura de tela', async () => {
  const carousel = await source('./PresentationCarousel.jsx');
  const artwork = await source('./PresentationArtwork.jsx');
  assert.match(carousel, /<UniMark \/>/);
  assert.match(carousel, /Em parceria com a SmartTech/);
  assert.match(artwork, /<UniRingOrb size=\{200\} state=\{UNI_RING_ORB_STATES\.LISTENING\} \/>/);
  assert.match(artwork, /Saída · rascunho/);
  assert.match(artwork, /PhShieldCheckIcon/);
  assert.doesNotMatch(`${carousel}\n${artwork}`, /apresentacao_parte|screenshot|backgroundImage|\.png/);
});

test('rota é autenticada, standalone e usuários concluídos não entram novamente', async () => {
  const app = await source('../../app/App.jsx');
  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /path: '\/apresentacao'/);
  assert.match(routes, /standalone: true/);
  assert.match(app, /if \(!session \|\| sessionError\)/);
  assert.match(app, /!presentationCompleted/);
  assert.match(app, /isPresentationRoute && presentationCompleted && !isPresentationReplay/);
  // A ternária de atalho pós-login (dentro de isPublicRoute) também contém o
  // texto "!presentationCompleted" -- por isso o guard REAL (que força
  // usuários autenticados sem apresentação concluída para /apresentacao) é
  // localizado pela assinatura completa do bloco, não por substring solta.
  assert.ok(
    app.indexOf('if (!session || sessionError)')
    < app.indexOf('presentationUserId\n    && !presentationCompleted'),
  );
});

test('onboarding legado permanece fora do fluxo principal', async () => {
  const app = await source('../../app/App.jsx');
  const auth = await source('../auth-mobile/pages/MobileAuthPage.jsx');
  assert.doesNotMatch(app, /needsOnboarding \? '\/onboarding'/);
  assert.doesNotMatch(auth, /navigate\([^)]*\/onboarding/);
  assert.match(auth, /POST_SIGN_UP_DESTINATION = PRESENTATION_ROUTE/);
});

test('CSS cobre safe areas, 320px, desktop e redução de movimento', async () => {
  const css = await source('./Presentation.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(min-width: 700px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /min-height: 44px/);
});
