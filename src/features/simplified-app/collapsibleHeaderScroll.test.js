import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HEADER_EFFECTIVELY_HIDDEN_PROGRESS,
  HEADER_EFFECTIVELY_VISIBLE_PROGRESS,
  HEADER_FADE_DISTANCE_PX,
  HEADER_PROGRESS_WRITE_TOLERANCE,
  HEADER_TOP_THRESHOLD_PX,
  nextHeaderEffectivelyHidden,
  nextHeaderProgress,
  shouldWriteHeaderProgress,
} from './collapsibleHeaderScroll.js';

// ============================================================================
// nextHeaderProgress -- matemática pura do fade contínuo.
// ============================================================================

test('no topo (<= topThreshold) o progress é sempre 0, mesmo vindo de um progress alto', () => {
  assert.equal(nextHeaderProgress(1, 0, 500), 0);
  assert.equal(nextHeaderProgress(0.6, HEADER_TOP_THRESHOLD_PX, 200), 0);
});

test('descer acumula progress proporcionalmente ao delta/fadeDistance -- nunca um salto binário', () => {
  const half = HEADER_FADE_DISTANCE_PX / 2;
  const progress = nextHeaderProgress(0, HEADER_TOP_THRESHOLD_PX + half, HEADER_TOP_THRESHOLD_PX);
  assert.ok(Math.abs(progress - 0.5) < 0.001, `esperado ~0.5, recebeu ${progress}`);
});

test('progress nunca ultrapassa 1, mesmo com scroll muito além do fadeDistance', () => {
  const progress = nextHeaderProgress(0, 10_000, 0);
  assert.equal(progress, 1);
});

test('progress nunca fica negativo, mesmo subindo além de onde começou', () => {
  const progress = nextHeaderProgress(0.1, 5, 500);
  assert.equal(progress, 0);
});

test('subir reduz o progress proporcionalmente -- processo exatamente inverso de descer', () => {
  const quarter = HEADER_FADE_DISTANCE_PX / 4;
  let progress = nextHeaderProgress(0, HEADER_TOP_THRESHOLD_PX + quarter * 2, HEADER_TOP_THRESHOLD_PX);
  assert.ok(Math.abs(progress - 0.5) < 0.001);
  progress = nextHeaderProgress(progress, HEADER_TOP_THRESHOLD_PX + quarter, HEADER_TOP_THRESHOLD_PX + quarter * 2);
  assert.ok(Math.abs(progress - 0.25) < 0.001, `esperado ~0.25, recebeu ${progress}`);
});

test('mesmo muito abaixo na página, um pequeno movimento para cima já reduz o progress (não precisa voltar ao topo)', () => {
  const deepScrollTop = 5000;
  const progress = nextHeaderProgress(1, deepScrollTop - 20, deepScrollTop);
  assert.ok(progress < 1, 'um pequeno movimento para cima já deveria começar a revelar o header');
});

test('jitter (pequenos movimentos alternando direção) produz variação suave, nunca binária', () => {
  let progress = 0;
  let scrollTop = HEADER_TOP_THRESHOLD_PX;
  const steps = [6, -3, 8, -4, 9, -5];
  for (const step of steps) {
    const previousScrollTop = scrollTop;
    scrollTop = Math.max(0, scrollTop + step);
    progress = nextHeaderProgress(progress, scrollTop, previousScrollTop);
    assert.ok(progress >= 0 && progress <= 1);
  }
  // Nunca deveria ter acumulado o suficiente para chegar perto de 1 com
  // esses movimentos pequenos e alternados.
  assert.ok(progress < 0.5, `jitter não deveria acumular tanto progress (${progress})`);
});

test('fadeDistance customizado é respeitado', () => {
  const progress = nextHeaderProgress(0, HEADER_TOP_THRESHOLD_PX + 10, HEADER_TOP_THRESHOLD_PX, { fadeDistancePx: 20 });
  assert.ok(Math.abs(progress - 0.5) < 0.001);
});

// ============================================================================
// nextHeaderEffectivelyHidden -- histerese de acessibilidade (interação).
// ============================================================================

test('progress abaixo do threshold de esconder nunca desativa interação', () => {
  assert.equal(nextHeaderEffectivelyHidden(false, 0), false);
  assert.equal(nextHeaderEffectivelyHidden(false, HEADER_EFFECTIVELY_HIDDEN_PROGRESS - 0.01), false);
});

test('progress no/acima do threshold de esconder desativa interação', () => {
  assert.equal(nextHeaderEffectivelyHidden(false, HEADER_EFFECTIVELY_HIDDEN_PROGRESS), true);
  assert.equal(nextHeaderEffectivelyHidden(false, 1), true);
});

test('progress no/abaixo do threshold de mostrar reativa interação', () => {
  assert.equal(nextHeaderEffectivelyHidden(true, HEADER_EFFECTIVELY_VISIBLE_PROGRESS), false);
  assert.equal(nextHeaderEffectivelyHidden(true, 0), false);
});

test('zona intermediária (entre os dois thresholds) preserva o estado anterior -- nunca pisca na borda', () => {
  const middle = (HEADER_EFFECTIVELY_HIDDEN_PROGRESS + HEADER_EFFECTIVELY_VISIBLE_PROGRESS) / 2;
  assert.equal(nextHeaderEffectivelyHidden(true, middle), true);
  assert.equal(nextHeaderEffectivelyHidden(false, middle), false);
});

// ============================================================================
// PERF-FIX1 -- shouldWriteHeaderProgress: elimina escritas redundantes em
// --header-progress (e a invalidação de estilo que cada setProperty
// dispara) sem nunca deixar o header "preso" perto de um extremo.
// ============================================================================

test('primeira escrita (lastWritten=null) sempre escreve, mesmo com progress=0', () => {
  assert.equal(shouldWriteHeaderProgress(0, null), true);
  assert.equal(shouldWriteHeaderProgress(0.5, null), true);
  assert.equal(shouldWriteHeaderProgress(0.0001, undefined), true);
});

test('mudança abaixo da tolerância nunca escreve -- elimina setProperty redundante em micro-movimentos de scroll', () => {
  assert.equal(shouldWriteHeaderProgress(0.500001, 0.5), false);
  assert.equal(shouldWriteHeaderProgress(0.5 + HEADER_PROGRESS_WRITE_TOLERANCE / 2, 0.5), false);
});

test('mudança na tolerância ou acima escreve', () => {
  assert.equal(shouldWriteHeaderProgress(0.5 + HEADER_PROGRESS_WRITE_TOLERANCE, 0.5), true);
  assert.equal(shouldWriteHeaderProgress(0.6, 0.5), true);
});

test('os extremos (0 e 1) SEMPRE escrevem, mesmo dentro da tolerância -- o header precisa alcançar de verdade 100% visível/escondido, nunca "quase"', () => {
  assert.equal(shouldWriteHeaderProgress(0, 0.001), true);
  assert.equal(shouldWriteHeaderProgress(1, 0.999), true);
});

test('tolerância customizada é respeitada', () => {
  assert.equal(shouldWriteHeaderProgress(0.52, 0.5, 0.05), false);
  assert.equal(shouldWriteHeaderProgress(0.56, 0.5, 0.05), true);
});

test('muitos micro-movimentos consecutivos abaixo da tolerância nunca escrevem -- só quando o acumulado cruza o limite', () => {
  let lastWritten = 0.5;
  let writes = 0;
  let progress = 0.5;
  // 10 incrementos de 0.001 (bem abaixo da tolerância de 0.005 cada um,
  // mas o SIMULADOR sempre compara contra o último ESCRITO, não o
  // último calculado -- então eventualmente cruza e escreve).
  for (let i = 0; i < 10; i += 1) {
    progress += 0.001;
    if (shouldWriteHeaderProgress(progress, lastWritten)) {
      writes += 1;
      lastWritten = progress;
    }
  }
  assert.ok(writes < 10, 'nem toda mudança de 0.001 deveria virar uma escrita real');
  assert.ok(writes >= 1, 'o acumulado eventualmente cruza a tolerância e precisa escrever');
});
