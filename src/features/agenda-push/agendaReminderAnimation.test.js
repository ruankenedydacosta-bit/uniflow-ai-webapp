import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelReminderAppliedAnimation,
  computeTrajectory,
  isUsableTarget,
  playReminderAppliedAnimation,
  prefersReducedMotion,
  REMINDER_ANIMATION_TIMELINE,
} from './agendaReminderAnimation.js';

// ============================================================================
// AGPUSH2 -- microinteracao do lembrete aplicado. O modulo recebe doc/win
// por parametro (mesmo padrao de mobilePushCapabilities.js), entao da pra
// testar COMPORTAMENTO de verdade sem jsdom: overlay criado/removido,
// quantidade de particulas, propriedades animadas, limpeza.
// ============================================================================

function createFakeElement(doc, tag) {
  const element = {
    tag,
    className: '',
    style: { cssText: '' },
    children: [],
    animations: [],
    removed: false,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {
      this.removed = true;
      const index = doc.body.children.indexOf(this);
      if (index >= 0) doc.body.children.splice(index, 1);
    },
    animate(keyframes, options) {
      const animation = { keyframes, options, finished: Promise.resolve(), cancel() {} };
      this.animations.push(animation);
      return animation;
    },
  };
  return element;
}

function createFakeDoc() {
  const doc = {
    body: {
      children: [],
      appendChild(element) {
        this.children.push(element);
        return element;
      },
    },
    created: [],
  };
  doc.createElement = (tag) => {
    const element = createFakeElement(doc, tag);
    doc.created.push(element);
    return element;
  };
  return doc;
}

function createFakeWin({ reduceMotion = false, width = 390, height = 844 } = {}) {
  return {
    innerWidth: width,
    innerHeight: height,
    matchMedia: () => ({ matches: reduceMotion }),
    getComputedStyle: () => ({ borderRadius: '14px' }),
  };
}

function createFakeTarget(rect) {
  const target = {
    animations: [],
    getBoundingClientRect: () => rect,
    animate(keyframes, options) {
      const animation = { keyframes, options, finished: Promise.resolve(), cancel() {} };
      this.animations.push(animation);
      return animation;
    },
  };
  return target;
}

const ORIGIN_RECT = { top: 300, left: 40, width: 300, height: 200 };
const VISIBLE_CARD_RECT = {
  top: 620, left: 16, width: 358, height: 54, bottom: 674, right: 374,
};

test.afterEach(() => cancelReminderAppliedAnimation());

// --------------------------------------------------------------------------
// Geometria
// --------------------------------------------------------------------------

test('computeTrajectory mira a regiao do horario/icone do card, nao o centro geometrico', () => {
  const trajectory = computeTrajectory(ORIGIN_RECT, VISIBLE_CARD_RECT);
  // 16 + min(64, 358*0.25 = 89.5) => 16 + 64
  assert.equal(trajectory.to.x, 80);
  assert.equal(trajectory.to.y, VISIBLE_CARD_RECT.top + (VISIBLE_CARD_RECT.height / 2));
});

test('computeTrajectory parte do centro do modal', () => {
  const trajectory = computeTrajectory(ORIGIN_RECT, VISIBLE_CARD_RECT);
  assert.equal(trajectory.from.x, 190);
  assert.equal(trajectory.from.y, 400);
});

test('a curva e MUITO leve -- o desvio perpendicular do meio do percurso tem teto de 26px', () => {
  const far = computeTrajectory(
    { top: 0, left: 0, width: 10, height: 10 },
    { top: 4000, left: 0, width: 100, height: 10 },
  );
  const midX = (far.from.x + far.to.x) / 2;
  const midY = (far.from.y + far.to.y) / 2;
  const deviation = Math.hypot(far.control.x - midX, far.control.y - midY);
  assert.ok(deviation <= 26.001, `desvio ${deviation} deveria respeitar o teto de 26px`);
});

test('computeTrajectory nunca produz NaN quando origem e destino coincidem', () => {
  const same = { top: 100, left: 100, width: 0, height: 0 };
  const trajectory = computeTrajectory(same, { ...same, width: 0, height: 0 });
  assert.ok(Number.isFinite(trajectory.control.x));
  assert.ok(Number.isFinite(trajectory.control.y));
  assert.equal(trajectory.distance, 0);
});

test('isUsableTarget rejeita card fora da viewport (acima, abaixo e sem area)', () => {
  const viewport = { width: 390, height: 844 };
  assert.equal(isUsableTarget(VISIBLE_CARD_RECT, viewport), true);
  assert.equal(isUsableTarget({ ...VISIBLE_CARD_RECT, top: 900, bottom: 954 }, viewport), false);
  assert.equal(isUsableTarget({ ...VISIBLE_CARD_RECT, top: -80, bottom: -20 }, viewport), false);
  assert.equal(isUsableTarget({ ...VISIBLE_CARD_RECT, width: 0 }, viewport), false);
});

// --------------------------------------------------------------------------
// Acessibilidade e fallbacks -- nunca animar quando nao se deve
// --------------------------------------------------------------------------

test('prefers-reduced-motion NAO anima nada e nem sequer cria o overlay', async () => {
  const doc = createFakeDoc();
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    doc,
    win: createFakeWin({ reduceMotion: true }),
  });

  assert.deepEqual(result, { played: false, reason: 'reduced-motion' });
  assert.equal(doc.body.children.length, 0);
  assert.equal(doc.created.length, 0);
});

test('prefersReducedMotion nunca lanca quando matchMedia nao existe', () => {
  assert.equal(prefersReducedMotion({}), false);
  assert.equal(prefersReducedMotion(undefined), false);
});

test('card desmontado (sem elemento) -- sem particula, sem overlay, sem erro', async () => {
  const doc = createFakeDoc();
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: null,
    doc,
    win: createFakeWin(),
  });

  assert.deepEqual(result, { played: false, reason: 'no-target' });
  assert.equal(doc.body.children.length, 0);
});

test('card fora da viewport -- sem particula (o chamador nunca da scroll automatico)', async () => {
  const doc = createFakeDoc();
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget({ ...VISIBLE_CARD_RECT, top: 2000, bottom: 2054 }),
    doc,
    win: createFakeWin(),
  });

  assert.deepEqual(result, { played: false, reason: 'target-offscreen' });
  assert.equal(doc.body.children.length, 0);
});

// --------------------------------------------------------------------------
// Caminho feliz
// --------------------------------------------------------------------------

test('card visivel -- a particula encontra o destino e a animacao roda', async () => {
  const doc = createFakeDoc();
  const target = createFakeTarget(VISIBLE_CARD_RECT);
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT, targetElement: target, doc, win: createFakeWin(),
  });

  assert.deepEqual(result, { played: true, reason: null });
});

test('UMA unica particula -- nunca chuva de particulas nem explosao', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    doc,
    win: createFakeWin(),
  });

  // overlay + glow + ring + particula = 4 nos, nunca uma lista de particulas
  assert.equal(doc.created.length, 4);
});

test('overlay e REMOVIDO ao final -- nenhuma particula fica orfa no DOM', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    doc,
    win: createFakeWin(),
  });

  assert.equal(doc.body.children.length, 0);
  assert.equal(doc.created[0].removed, true);
});

test('execucao repetida nao acumula overlays', async () => {
  const doc = createFakeDoc();
  const win = createFakeWin();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await playReminderAppliedAnimation({
      originRect: ORIGIN_RECT, targetElement: createFakeTarget(VISIBLE_CARD_RECT), doc, win,
    });
  }

  assert.equal(doc.body.children.length, 0);
});

test('cancelReminderAppliedAnimation limpa uma microinteracao em andamento (unmount da tela)', async () => {
  const doc = createFakeDoc();
  const pending = playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    doc,
    win: createFakeWin(),
  });

  cancelReminderAppliedAnimation();
  assert.equal(doc.body.children.length, 0);
  await pending;
  assert.equal(doc.body.children.length, 0);
});

// --------------------------------------------------------------------------
// Performance: so transform/opacity (GPU), nunca top/left frame a frame
// --------------------------------------------------------------------------

test('a particula anima SOMENTE transform e opacity -- nunca top/left/width/height', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    doc,
    win: createFakeWin(),
  });

  const particle = doc.created[1];
  const animatedProps = new Set(
    particle.animations.flatMap((animation) => animation.keyframes.flatMap(Object.keys)),
  );
  animatedProps.delete('offset');
  assert.deepEqual([...animatedProps].sort(), ['opacity', 'transform']);
});

test('a trajetoria usa translate3d (composicao na GPU)', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    doc,
    win: createFakeWin(),
  });

  const [travel] = doc.created[1].animations;
  assert.ok(travel.keyframes.every((frame) => frame.transform.includes('translate3d')));
});

test('o card recebe um micro-scale sutil (nunca acima de 1.015) e volta ao normal', async () => {
  const doc = createFakeDoc();
  const target = createFakeTarget(VISIBLE_CARD_RECT);
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT, targetElement: target, doc, win: createFakeWin(),
  });

  assert.equal(target.animations.length, 1);
  const [scale] = target.animations;
  const scales = scale.keyframes.map((frame) => Number.parseFloat(frame.transform.match(/scale\(([\d.]+)\)/)[1]));
  assert.equal(scales[0], 1);
  assert.equal(scales[scales.length - 1], 1, 'o card precisa voltar exatamente a escala original');
  assert.ok(Math.max(...scales) <= 1.015, 'micro-scale precisa ser sutil');
  // Sem `fill`: nenhum estilo inline fica grudado no card depois.
  assert.equal(scale.options.fill, undefined);
});

test('o contorno do card usa o border-radius REAL lido do computed style', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    doc,
    win: { ...createFakeWin(), getComputedStyle: () => ({ borderRadius: '22px' }) },
  });

  const ring = doc.created[3];
  assert.match(ring.style.cssText, /border-radius:22px/);
  assert.match(ring.style.cssText, /top:620px/);
  assert.match(ring.style.cssText, /left:16px/);
});

// --------------------------------------------------------------------------
// Duracao total
// --------------------------------------------------------------------------

test('as classes visuais vem de quem chama (CSS module) -- o modulo segue JS puro e testavel', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    classNames: {
      overlay: 'hashed-overlay',
      particle: 'hashed-particle',
      cardGlow: 'hashed-glow',
      cardRing: 'hashed-ring',
    },
    doc,
    win: createFakeWin(),
  });

  assert.deepEqual(
    doc.created.map((element) => element.className),
    ['hashed-overlay', 'hashed-particle', 'hashed-glow', 'hashed-ring'],
  );
});

test('o overlay nunca captura toque -- e responsabilidade do CSS, declarada no module', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./agendaReminderAnimation.module.css', import.meta.url), 'utf8');
  const overlayBlock = css.slice(css.indexOf('.overlay {'), css.indexOf('.particle {'));
  assert.match(overlayBlock, /pointer-events:\s*none;/);
  assert.match(overlayBlock, /position:\s*fixed;/);
  // Regra da casa (utilities.css): nunca um z-index numerico solto.
  assert.match(overlayBlock, /z-index:\s*var\(--uf-z-[a-z-]+\);/);
});

test('a paleta usa SOMENTE tokens de marca (violeta/azul/ciano) -- nenhum verde/amarelo/vermelho/laranja', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./agendaReminderAnimation.module.css', import.meta.url), 'utf8');
  assert.match(css, /--uf-app-ai/);
  assert.match(css, /--uf-app-primary/);
  assert.match(css, /--uf-app-cyan/);
  // Bordas de palavra de propósito: "prefers-reduced-motion" contém "red"
  // e não é uma cor.
  assert.doesNotMatch(css, /\b(green|yellow|red|orange)\b/i);
  assert.doesNotMatch(css, /--uf-app-success|--uf-app-warning|--uf-app-danger/);
  // Nenhuma cor nova hardcoded (o branco do nucleo da particula e o unico
  // literal aceito, por ser luz e nao cor de marca).
  const hexColors = (css.match(/#[0-9a-f]{3,8}\b/gi) ?? []).filter((hex) => hex.toLowerCase() !== '#fff' && hex !== '#000');
  assert.deepEqual(hexColors, []);
});

test('a microinteracao inteira fica bem abaixo de 1.1s', () => {
  const { ringDelay, ringDuration } = REMINDER_ANIMATION_TIMELINE;
  // O passo mais longo termina em ringDelay + ringDuration; somado a
  // confirmacao + recolhimento do modal (120 + 180) segue em ~1s.
  assert.ok(ringDelay + ringDuration + 300 <= 1100);
});
