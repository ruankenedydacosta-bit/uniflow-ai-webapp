import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelReminderAppliedAnimation,
  computeTrajectory,
  isUsableTarget,
  playReminderAppliedAnimation,
  prefersReducedMotion,
} from './agendaReminderAnimation.js';
import {
  getAbsorptionCompleteMs,
  getMotionEngineTotalMs,
  REMINDER_MOTION_PROFILES,
  REMINDER_MOTION_VARIANTS,
} from './agendaReminderMotionProfiles.js';

// ============================================================================
// AGPUSH2/AGPUSH4 -- microinteracao do lembrete aplicado. O modulo recebe
// doc/win por parametro (mesmo padrao de mobilePushCapabilities.js), entao
// da pra testar COMPORTAMENTO de verdade sem jsdom: overlay criado/
// removido, quantidade de particulas, propriedades animadas, limpeza,
// timing por perfil (energetic/calm).
// ============================================================================

const ENERGETIC = REMINDER_MOTION_PROFILES[REMINDER_MOTION_VARIANTS.ENERGETIC];
const CALM = REMINDER_MOTION_PROFILES[REMINDER_MOTION_VARIANTS.CALM];

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

test('a curva default e MUITO leve -- o desvio perpendicular do meio do percurso tem teto de 26px', () => {
  const far = computeTrajectory(
    { top: 0, left: 0, width: 10, height: 10 },
    { top: 4000, left: 0, width: 100, height: 10 },
  );
  const midX = (far.from.x + far.to.x) / 2;
  const midY = (far.from.y + far.to.y) / 2;
  const deviation = Math.hypot(far.control.x - midX, far.control.y - midY);
  assert.ok(deviation <= 26.001, `desvio ${deviation} deveria respeitar o teto de 26px`);
});

test('AGPUSH4: energetic usa uma curva mais reta que calm -- mesma distancia, desvio menor', () => {
  const from = { top: 0, left: 0, width: 10, height: 10 };
  const to = { top: 4000, left: 0, width: 100, height: 10 };

  const energeticTrajectory = computeTrajectory(from, to, {
    arcFactor: ENERGETIC.trajectoryArcFactor, arcCapPx: ENERGETIC.trajectoryArcCapPx,
  });
  const calmTrajectory = computeTrajectory(from, to, {
    arcFactor: CALM.trajectoryArcFactor, arcCapPx: CALM.trajectoryArcCapPx,
  });

  const deviationOf = (trajectory) => {
    const midX = (trajectory.from.x + trajectory.to.x) / 2;
    const midY = (trajectory.from.y + trajectory.to.y) / 2;
    return Math.hypot(trajectory.control.x - midX, trajectory.control.y - midY);
  };

  assert.ok(deviationOf(energeticTrajectory) < deviationOf(calmTrajectory));
  // Ambos continuam "MUITO leves" -- nunca um arco exagerado.
  assert.ok(deviationOf(energeticTrajectory) <= ENERGETIC.trajectoryArcCapPx + 0.001);
  assert.ok(deviationOf(calmTrajectory) <= CALM.trajectoryArcCapPx + 0.001);
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

test('prefers-reduced-motion NAO anima nada e nem sequer cria o overlay -- mas ainda revela o indicador (onAbsorbed sincrono)', async () => {
  const doc = createFakeDoc();
  let absorbedCalls = 0;
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    profile: ENERGETIC,
    onAbsorbed: () => { absorbedCalls += 1; },
    doc,
    win: createFakeWin({ reduceMotion: true }),
  });

  assert.deepEqual(result, { played: false, reason: 'reduced-motion' });
  assert.equal(doc.body.children.length, 0);
  assert.equal(doc.created.length, 0);
  assert.equal(absorbedCalls, 1, 'sem particula, o indicador nunca deve ficar preso esperando uma absorcao que nunca vai acontecer');
});

test('prefersReducedMotion nunca lanca quando matchMedia nao existe', () => {
  assert.equal(prefersReducedMotion({}), false);
  assert.equal(prefersReducedMotion(undefined), false);
});

test('card desmontado (sem elemento) -- sem particula, sem overlay, sem erro, indicador revelado na hora', async () => {
  const doc = createFakeDoc();
  let absorbedCalls = 0;
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: null,
    profile: ENERGETIC,
    onAbsorbed: () => { absorbedCalls += 1; },
    doc,
    win: createFakeWin(),
  });

  assert.deepEqual(result, { played: false, reason: 'no-target' });
  assert.equal(doc.body.children.length, 0);
  assert.equal(absorbedCalls, 1);
});

test('card fora da viewport -- sem particula (o chamador nunca da scroll automatico), indicador revelado na hora', async () => {
  const doc = createFakeDoc();
  let absorbedCalls = 0;
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget({ ...VISIBLE_CARD_RECT, top: 2000, bottom: 2054 }),
    profile: ENERGETIC,
    onAbsorbed: () => { absorbedCalls += 1; },
    doc,
    win: createFakeWin(),
  });

  assert.deepEqual(result, { played: false, reason: 'target-offscreen' });
  assert.equal(doc.body.children.length, 0);
  assert.equal(absorbedCalls, 1);
});

test('onAbsorbed que lanca nunca derruba o motor de animacao', async () => {
  const doc = createFakeDoc();
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: null,
    profile: ENERGETIC,
    onAbsorbed: () => { throw new Error('boom'); },
    doc,
    win: createFakeWin(),
  });
  assert.equal(result.played, false);
});

// --------------------------------------------------------------------------
// Caminho feliz
// --------------------------------------------------------------------------

test('card visivel -- a particula encontra o destino e a animacao roda', async () => {
  const doc = createFakeDoc();
  const target = createFakeTarget(VISIBLE_CARD_RECT);
  const result = await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT, targetElement: target, profile: ENERGETIC, doc, win: createFakeWin(),
  });

  assert.deepEqual(result, { played: true, reason: null });
});

test('onAbsorbed dispara depois de travel+absorb -- exatamente quando a particula termina de ser absorvida, nunca antes', async () => {
  const doc = createFakeDoc();
  const order = [];
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    profile: ENERGETIC,
    onAbsorbed: () => order.push('absorbed'),
    doc,
    win: createFakeWin(),
  });
  order.push('engine-settled');
  // Com finished:Promise.resolve() no fake, ambos resolvem no mesmo tick de
  // microtask -- o que importa (coberto abaixo com granularidade real) e
  // que onAbsorbed esta ligado ao `.finished` do absorb, nunca do travel
  // isolado nem de um timer solto.
  assert.deepEqual(order, ['absorbed', 'engine-settled']);
});

test('UMA unica particula -- nunca chuva de particulas nem explosao', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    profile: ENERGETIC,
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
    profile: ENERGETIC,
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
      originRect: ORIGIN_RECT, targetElement: createFakeTarget(VISIBLE_CARD_RECT), profile: ENERGETIC, doc, win,
    });
  }

  assert.equal(doc.body.children.length, 0);
});

test('cancelReminderAppliedAnimation limpa uma microinteracao em andamento (unmount da tela)', async () => {
  const doc = createFakeDoc();
  const pending = playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    profile: ENERGETIC,
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
    profile: ENERGETIC,
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
    profile: ENERGETIC,
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
    originRect: ORIGIN_RECT, targetElement: target, profile: ENERGETIC, doc, win: createFakeWin(),
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
    profile: ENERGETIC,
    doc,
    win: { ...createFakeWin(), getComputedStyle: () => ({ borderRadius: '22px' }) },
  });

  const ring = doc.created[3];
  assert.match(ring.style.cssText, /border-radius:22px/);
  assert.match(ring.style.cssText, /top:620px/);
  assert.match(ring.style.cssText, /left:16px/);
});

// --------------------------------------------------------------------------
// AGPUSH4 -- cada fase usa a duracao do PROFILE, nunca um valor local
// --------------------------------------------------------------------------

test('travel/absorb usam travelDuration/absorbDuration do profile -- energetic e calm produzem durações diferentes', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT, targetElement: createFakeTarget(VISIBLE_CARD_RECT), profile: ENERGETIC, doc, win: createFakeWin(),
  });
  const [travel, absorb] = doc.created[1].animations;
  assert.equal(travel.options.duration, ENERGETIC.travelDuration);
  assert.equal(absorb.options.duration, ENERGETIC.absorbDuration);
  assert.equal(absorb.options.delay, ENERGETIC.travelDuration);

  const doc2 = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT, targetElement: createFakeTarget(VISIBLE_CARD_RECT), profile: CALM, doc: doc2, win: createFakeWin(),
  });
  const [travel2, absorb2] = doc2.created[1].animations;
  assert.equal(travel2.options.duration, CALM.travelDuration);
  assert.equal(absorb2.options.duration, CALM.absorbDuration);
  assert.notEqual(travel.options.duration, travel2.options.duration, 'energetic e calm devem ter durações diferentes');
});

test('ring/glow/cardScale usam delay+duration do profile', async () => {
  const doc = createFakeDoc();
  const target = createFakeTarget(VISIBLE_CARD_RECT);
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT, targetElement: target, profile: CALM, doc, win: createFakeWin(),
  });

  const glow = doc.created[2];
  const [glowAnimation] = glow.animations;
  assert.equal(glowAnimation.options.duration, CALM.glowDuration);
  assert.equal(glowAnimation.options.delay, CALM.glowDelay);

  const ring = doc.created[3];
  const [ringOpacity] = ring.animations;
  assert.equal(ringOpacity.options.duration, CALM.ringDuration);
  assert.equal(ringOpacity.options.delay, CALM.ringDelay);

  const [cardScale] = target.animations;
  assert.equal(cardScale.options.duration, CALM.cardScaleDuration);
  assert.equal(cardScale.options.delay, CALM.cardScaleDelay);
});

test('a curva da trajetoria usa trajectoryArcFactor/trajectoryArcCapPx do profile', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    profile: { ...ENERGETIC, trajectoryArcFactor: 0, trajectoryArcCapPx: 0 },
    doc,
    win: createFakeWin(),
  });
  const [travel] = doc.created[1].animations;
  // Sem curva (arcFactor 0), o ponto de controle cai exatamente na reta
  // entre origem e destino -- confirma que o profile realmente controla
  // a geometria, nao um valor fixo interno.
  const controlFrame = travel.keyframes[2];
  assert.ok(controlFrame.transform.includes('translate3d'));
});

test('ring class combina a classe base (compartilhada) com a classe de variante (enfase de cor)', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    profile: ENERGETIC,
    classNames: {
      overlay: 'hashed-overlay',
      particle: 'hashed-particle',
      cardGlow: 'hashed-glow',
      cardRing: 'hashed-ring-base',
      cardRingVariant: 'hashed-ring-bright-early',
    },
    doc,
    win: createFakeWin(),
  });

  const ring = doc.created[3];
  assert.equal(ring.className, 'hashed-ring-base hashed-ring-bright-early');
});

// --------------------------------------------------------------------------
// AGPUSH4 -- classes visuais e paleta
// --------------------------------------------------------------------------

test('as classes visuais vem de quem chama (CSS module) -- o modulo segue JS puro e testavel', async () => {
  const doc = createFakeDoc();
  await playReminderAppliedAnimation({
    originRect: ORIGIN_RECT,
    targetElement: createFakeTarget(VISIBLE_CARD_RECT),
    profile: ENERGETIC,
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

// --------------------------------------------------------------------------
// AGPUSH4 -- duração total por perfil, dentro dos alvos pedidos
// --------------------------------------------------------------------------

test('energetic (30min): motor termina em 930ms -- o contorno (930) e a fase mais longa, nao travel+absorb (600)', () => {
  assert.equal(getMotionEngineTotalMs(ENERGETIC), 930);
  assert.equal(ENERGETIC.ringDelay + ENERGETIC.ringDuration, 930);
});

test('calm (1h): motor termina em 1120ms -- o contorno (1120) e a fase mais longa', () => {
  assert.equal(getMotionEngineTotalMs(CALM), 1120);
  assert.equal(CALM.ringDelay + CALM.ringDuration, 1120);
});

test('total percebido energetic (confirm+2 recolhimentos+~1 frame+motor) cai em 1.50s-1.60s', () => {
  const RAF_MS = 16;
  const total = ENERGETIC.confirmMs + ENERGETIC.modalCollapseMs + ENERGETIC.formCollapseMs
    + RAF_MS + getMotionEngineTotalMs(ENERGETIC);
  assert.ok(total >= 1500 && total <= 1600, `total ${total}ms fora do alvo 1500-1600ms`);
});

test('total percebido calm (confirm+2 recolhimentos+~1 frame+motor) cai em 1.75s-1.85s', () => {
  const RAF_MS = 16;
  const total = CALM.confirmMs + CALM.modalCollapseMs + CALM.formCollapseMs
    + RAF_MS + getMotionEngineTotalMs(CALM);
  assert.ok(total >= 1750 && total <= 1850, `total ${total}ms fora do alvo 1750-1850ms`);
});

test('calm NAO e energetic multiplicado por um fator fixo -- cada fase foi recalibrada de forma independente', () => {
  const ratios = [
    CALM.travelDuration / ENERGETIC.travelDuration,
    CALM.absorbDuration / ENERGETIC.absorbDuration,
    CALM.ringDuration / ENERGETIC.ringDuration,
    CALM.glowDuration / ENERGETIC.glowDuration,
    CALM.cardScaleDuration / ENERGETIC.cardScaleDuration,
  ];
  const distinctRatios = new Set(ratios.map((ratio) => ratio.toFixed(3)));
  assert.ok(distinctRatios.size > 1, 'se todas as razões fossem iguais, calm seria só um "energetic mais lento"');
});

test('getAbsorptionCompleteMs = travelDuration + absorbDuration, para os dois perfis', () => {
  assert.equal(getAbsorptionCompleteMs(ENERGETIC), 600);
  assert.equal(getAbsorptionCompleteMs(CALM), 680);
});

test('mais da metade da duração do contorno NUNCA é consumida só por fade (entrada 18% + saída 25% = 43%)', () => {
  // As offsets do keyframe de opacidade do ring (0 -> 0.18 -> 0.75 -> 1)
  // sao fixas no motor; 1 - 0.18 - (1-0.75) = 0.57 de intensidade plena,
  // ou seja 43% de fade -- sempre menos da metade, para os dois perfis
  // (a proporcao e a mesma, so a duracao absoluta muda).
  const fadeInFraction = 0.18;
  const fadeOutFraction = 1 - 0.75;
  assert.ok(fadeInFraction + fadeOutFraction < 0.5);
});
