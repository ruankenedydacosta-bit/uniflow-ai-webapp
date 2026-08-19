import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COLLAPSIBLE_HEADER_DOWN_THRESHOLD_PX,
  COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX,
  COLLAPSIBLE_HEADER_UP_THRESHOLD_PX,
  createInitialCollapsibleHeaderState,
  nextCollapsibleHeaderState,
} from './collapsibleHeaderScroll.js';

test('estado inicial: topo, visível, acumuladores zerados', () => {
  assert.deepEqual(createInitialCollapsibleHeaderState(), {
    lastScrollTop: 0, downAccum: 0, upAccum: 0, hidden: false,
  });
});

test('constantes de threshold ficam dentro das faixas pedidas (down 20-30px, up 12-20px)', () => {
  assert.ok(COLLAPSIBLE_HEADER_DOWN_THRESHOLD_PX >= 20 && COLLAPSIBLE_HEADER_DOWN_THRESHOLD_PX <= 30);
  assert.ok(COLLAPSIBLE_HEADER_UP_THRESHOLD_PX >= 12 && COLLAPSIBLE_HEADER_UP_THRESHOLD_PX <= 20);
});

// Estabelece uma baseline "visível, longe do topo" de forma limpa: um
// scrollTop <= topThreshold sempre reseta os acumuladores e força
// hidden=false -- daí em diante, cada delta é um incremento realista
// (como eventos de scroll reais chegam), nunca um salto arbitrário
// interpretado como "desceu tudo isso de uma vez".
function settledVisibleBaseline() {
  return nextCollapsibleHeaderState(createInitialCollapsibleHeaderState(), COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX);
}

test('jitter (pequenos movimentos alternando direção) nunca esconde o header -- sem "piscar"', () => {
  let state = settledVisibleBaseline();
  // Sobe/desce poucos px repetidamente -- nunca acumula 24px seguidos na
  // MESMA direção (cada inversão reseta o acumulador oposto).
  const jitterSteps = [6, 3, 8, 4, 9, 5, 7];
  let scrollTop = COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX;
  let goingDown = true;
  for (const step of jitterSteps) {
    scrollTop += goingDown ? step : -step;
    state = nextCollapsibleHeaderState(state, scrollTop);
    assert.equal(state.hidden, false, `jitter não deveria esconder (scrollTop=${scrollTop})`);
    goingDown = !goingDown;
  }
});

test('scroll para baixo acumulado além do threshold esconde o header (abaixo do threshold ainda não)', () => {
  let state = settledVisibleBaseline();
  const justBelow = COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX + (COLLAPSIBLE_HEADER_DOWN_THRESHOLD_PX - 1);
  state = nextCollapsibleHeaderState(state, justBelow);
  assert.equal(state.hidden, false, 'ainda abaixo do threshold, precisa continuar visível');

  state = nextCollapsibleHeaderState(state, justBelow + 2);
  assert.equal(state.hidden, true, 'cruzou o threshold acumulado, precisa esconder');
});

test('scroll para cima acumulado além do threshold reexibe o header', () => {
  let state = settledVisibleBaseline();
  const hiddenAt = COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX + COLLAPSIBLE_HEADER_DOWN_THRESHOLD_PX;
  state = nextCollapsibleHeaderState(state, hiddenAt);
  assert.equal(state.hidden, true);

  state = nextCollapsibleHeaderState(state, hiddenAt - COLLAPSIBLE_HEADER_UP_THRESHOLD_PX);
  assert.equal(state.hidden, false);
});

test('inversão de sentido reseta o acumulador oposto -- nunca soma dois momentos de descida separados por uma subida', () => {
  let state = settledVisibleBaseline();
  // Desce 15px (abaixo do threshold de 24) -- ainda visível.
  state = nextCollapsibleHeaderState(state, COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX + 15);
  assert.equal(state.hidden, false);
  assert.equal(state.downAccum, 15);
  // Inverte: sobe 5px -- downAccum precisa zerar (nunca ficar "guardado").
  state = nextCollapsibleHeaderState(state, COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX + 10);
  assert.equal(state.downAccum, 0);
  assert.equal(state.upAccum, 5);
  // Volta a descer 15px -- precisa recomeçar do zero, não reaproveitar os 15 anteriores.
  state = nextCollapsibleHeaderState(state, COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX + 25);
  assert.equal(state.downAccum, 15);
  assert.equal(state.hidden, false, 'a soma dos dois momentos de descida (15+15=30) nunca deveria contar -- só o acumulado contínuo na mesma direção');
});

test('voltar ao topo (<= threshold) sempre força visível, mesmo escondido antes', () => {
  let state = nextCollapsibleHeaderState(createInitialCollapsibleHeaderState(), 200);
  state = nextCollapsibleHeaderState(state, 200 + COLLAPSIBLE_HEADER_DOWN_THRESHOLD_PX);
  assert.equal(state.hidden, true);

  state = nextCollapsibleHeaderState(state, COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX);
  assert.equal(state.hidden, false);
  assert.equal(state.downAccum, 0);
  assert.equal(state.upAccum, 0);
});

test('scrollTop negativo (bounce/overscroll) nunca quebra -- tratado como 0', () => {
  const state = nextCollapsibleHeaderState(createInitialCollapsibleHeaderState(), -40);
  assert.equal(state.hidden, false);
  assert.equal(state.lastScrollTop, 0);
});

test('delta zero (sem movimento real) não altera hidden nem os acumuladores', () => {
  let state = nextCollapsibleHeaderState(createInitialCollapsibleHeaderState(), 100);
  state = nextCollapsibleHeaderState(state, 115);
  const before = state;
  state = nextCollapsibleHeaderState(state, 115);
  assert.deepEqual(state, before);
});

test('thresholds customizados (config explícita) são respeitados em vez dos defaults', () => {
  let state = nextCollapsibleHeaderState(createInitialCollapsibleHeaderState(), 100, { downThresholdPx: 5, upThresholdPx: 5, topThresholdPx: 4 });
  state = nextCollapsibleHeaderState(state, 106, { downThresholdPx: 5, upThresholdPx: 5, topThresholdPx: 4 });
  assert.equal(state.hidden, true, 'com threshold customizado de 5px, 6px acumulados já deveria esconder');
});
