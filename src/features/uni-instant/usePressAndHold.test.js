import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import usePressAndHold, {
  CANCEL_DRAG_PX,
  FAILSAFE_TIMEOUT_MS,
  HOLD_THRESHOLD_MS,
} from './usePressAndHold.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// EventTarget real do Node (mesmo padrão de pwaInstall.test.js) faz o papel
// de `window`: suporta addEventListener/removeEventListener/dispatchEvent de
// verdade, sem depender de jsdom -- exercita a rede de segurança de verdade,
// não só a leitura do source.
function createFakeRuntime() {
  return new EventTarget();
}

function createFakeElement() {
  let capturedId = null;
  return {
    setPointerCapture(id) { capturedId = id; },
    releasePointerCapture(id) { if (capturedId === id) capturedId = null; },
    hasPointerCapture(id) { return capturedId === id; },
  };
}

function pointerEvent({ pointerId = 1, x = 0, y = 0, button = 0, currentTarget, ...rest } = {}) {
  return {
    pointerId,
    clientX: x,
    clientY: y,
    button,
    currentTarget,
    preventDefault() {},
    ...rest,
  };
}

function mountHarness({ runtime } = {}) {
  const calls = { onTap: 0, onHoldStart: 0, onHoldEnd: 0, onHoldCancel: 0 };
  const states = [];
  let latestBind;
  const fakeElement = createFakeElement();

  function Harness() {
    const { gestureState, bind } = usePressAndHold({
      onTap: () => { calls.onTap += 1; },
      onHoldStart: () => { calls.onHoldStart += 1; },
      onHoldEnd: () => { calls.onHoldEnd += 1; },
      onHoldCancel: () => { calls.onHoldCancel += 1; },
      runtime,
    });
    states.push(gestureState);
    latestBind = bind;
    // Espalha `bind` de verdade (inclui `ref`), igual ao uso real em
    // UniInstantButton.jsx -- sem isso, elementRef.current nunca é
    // preenchido pelo createNodeMock, e a limpeza de pointer capture no
    // unmount do hook não teria nenhum elemento para liberar.
    return React.createElement('button', { ...bind, type: 'button' }, 'Uni');
  }

  let renderer;
  act(() => {
    renderer = create(React.createElement(Harness), {
      createNodeMock: () => fakeElement,
    });
  });

  return {
    calls,
    currentState: () => states[states.length - 1],
    fire: (name, options) => act(() => {
      latestBind[name](pointerEvent({ currentTarget: fakeElement, ...options }));
    }),
    down: (options) => act(() => {
      latestBind.onPointerDown(pointerEvent({ currentTarget: fakeElement, ...options }));
    }),
    wait: (ms) => act(() => new Promise((resolve) => { setTimeout(resolve, ms); })),
    unmount: () => act(() => { renderer.unmount(); }),
    fakeElement,
  };
}

async function holdPastThreshold(h, options) {
  await h.down(options);
  await h.wait(HOLD_THRESHOLD_MS + 20);
}

test('toque normal (release rápido, sem ultrapassar o threshold de hold) dispara só onTap', async () => {
  const h = mountHarness();
  await h.down();
  await h.fire('onPointerUp');
  assert.deepEqual(h.calls, { onTap: 1, onHoldStart: 0, onHoldEnd: 0, onHoldCancel: 0 });
  assert.equal(h.currentState(), 'idle');
});

test('fluxo normal de hold: segurar além do threshold e soltar no lugar encerra com onHoldEnd (nunca cancel)', async () => {
  const h = mountHarness();
  await holdPastThreshold(h);
  assert.equal(h.currentState(), 'holding');
  await h.fire('onPointerUp');
  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 1, onHoldCancel: 0 });
  assert.equal(h.currentState(), 'idle');
});

for (const [label, delta] of [
  ['cima', { x: 0, y: -(CANCEL_DRAG_PX + 10) }],
  ['direita', { x: CANCEL_DRAG_PX + 10, y: 0 }],
  ['esquerda', { x: -(CANCEL_DRAG_PX + 10), y: 0 }],
  ['baixo', { x: 0, y: CANCEL_DRAG_PX + 10 }],
  ['diagonal', { x: CANCEL_DRAG_PX, y: CANCEL_DRAG_PX }],
]) {
  test(`drag para ${label} além do threshold cancela o gesto e libera o botão para uma nova tentativa (nunca trava em holding)`, async () => {
    const h = mountHarness();
    await holdPastThreshold(h);
    assert.equal(h.currentState(), 'holding');
    await h.fire('onPointerMove', { x: delta.x, y: delta.y });
    assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 0, onHoldCancel: 1 });
    assert.equal(h.currentState(), 'idle');

    // Uma nova tentativa imediatamente depois funciona normalmente -- prova
    // de que sourceRef/pointerIdRef foram limpos de verdade, em qualquer
    // direção de arrasto (Math.hypot trata todas as direções igual).
    await holdPastThreshold(h);
    assert.equal(h.currentState(), 'holding');
    assert.equal(h.calls.onHoldStart, 2);
    await h.fire('onPointerUp');
    assert.equal(h.calls.onHoldEnd, 1);
  });
}

test('soltar fora da área visual, mas dentro do threshold de 56px, ainda finaliza normalmente (pointer capture entrega o pointerup ao botão independente de onde o dedo está)', async () => {
  const h = mountHarness();
  await holdPastThreshold(h);
  // O pointerup chega com coordenadas fora do círculo visível do botão --
  // pointer capture garante que currentTarget continua sendo o botão.
  await h.fire('onPointerUp', { x: 30, y: 30 });
  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 1, onHoldCancel: 0 });
  assert.equal(h.currentState(), 'idle');
});

test('pointercancel (o navegador reinterpreta o gesto, ex.: como scroll) cancela e libera o botão', async () => {
  const h = mountHarness();
  await holdPastThreshold(h);
  await h.fire('onPointerCancel');
  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 0, onHoldCancel: 1 });
  assert.equal(h.currentState(), 'idle');

  await holdPastThreshold(h);
  assert.equal(h.calls.onHoldStart, 2);
});

test('lostpointercapture (captura perdida sem pointerup/pointercancel correspondente) cancela e libera o botão', async () => {
  const h = mountHarness();
  await holdPastThreshold(h);
  await h.fire('onLostPointerCapture');
  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 0, onHoldCancel: 1 });
  assert.equal(h.currentState(), 'idle');

  await holdPastThreshold(h);
  assert.equal(h.calls.onHoldStart, 2);
});

test('REDE DE SEGURANÇA: se o navegador nunca entrega pointerup/pointercancel/lostpointercapture ao botão (o bug real de dispositivo), mas dispara pointercancel em `window`, o gesto ainda é cancelado e o botão é liberado', async () => {
  const runtime = createFakeRuntime();
  const h = mountHarness({ runtime });
  await holdPastThreshold(h);
  assert.equal(h.currentState(), 'holding');

  // Nenhum evento chega ao elemento -- só a janela recebe o pointercancel,
  // como aconteceria se o navegador tivesse hijackado o gesto para
  // scroll/overscroll sem notificar o alvo capturado.
  await act(async () => {
    const event = new Event('pointercancel');
    event.pointerId = 1;
    runtime.dispatchEvent(event);
  });

  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 0, onHoldCancel: 1 });
  assert.equal(h.currentState(), 'idle');

  // Nova tentativa imediatamente depois funciona -- não ficou preso.
  await holdPastThreshold(h);
  assert.equal(h.calls.onHoldStart, 2);
});

test('REDE DE SEGURANÇA: pointerup em `window` com um pointerId diferente do gesto ativo é ignorado (não cancela o gesto de outro dedo)', async () => {
  const runtime = createFakeRuntime();
  const h = mountHarness({ runtime });
  await holdPastThreshold(h);

  await act(async () => {
    const event = new Event('pointerup');
    event.pointerId = 999;
    runtime.dispatchEvent(event);
  });

  assert.equal(h.currentState(), 'holding');
  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 0, onHoldCancel: 0 });
});

test('REDE DE SEGURANÇA: falha total (timeout de segurança) força a saída de "holding" mesmo sem NENHUM evento, em janela ou elemento', (t) => {
  // Timers falsos (node:test) em vez de esperar os 10s reais do
  // FAILSAFE_TIMEOUT_MS -- mesma garantia, sem deixar a suíte lenta.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = createFakeRuntime();
  const h = mountHarness({ runtime });

  h.down();
  act(() => { t.mock.timers.tick(HOLD_THRESHOLD_MS + 20); });
  assert.equal(h.currentState(), 'holding');

  act(() => { t.mock.timers.tick(FAILSAFE_TIMEOUT_MS + 50); });

  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 0, onHoldCancel: 1 });
  assert.equal(h.currentState(), 'idle');
});

test('REDE DE SEGURANÇA: terminar o gesto pelo caminho normal remove o listener de window e o timeout de segurança -- rodar finish() de novo não duplica onHoldCancel/onHoldEnd', async () => {
  const runtime = createFakeRuntime();
  const removedEvents = [];
  const originalRemove = runtime.removeEventListener.bind(runtime);
  runtime.removeEventListener = (name, ...rest) => {
    removedEvents.push(name);
    return originalRemove(name, ...rest);
  };
  const h = mountHarness({ runtime });
  await holdPastThreshold(h);
  await h.fire('onPointerUp');

  assert.ok(removedEvents.includes('pointerup'));
  assert.ok(removedEvents.includes('pointercancel'));

  // Um pointercancel "atrasado" que ainda chegasse na janela depois do
  // término normal não deveria fazer nada -- sourceRef já foi limpo.
  await act(async () => {
    const event = new Event('pointercancel');
    event.pointerId = 1;
    runtime.dispatchEvent(event);
  });
  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 1, onHoldCancel: 0 });
});

test('gesto cancelado permite iniciar uma nova gravação imediatamente (sourceRef/pointerIdRef realmente voltam a null)', async () => {
  const h = mountHarness();
  await holdPastThreshold(h);
  await h.fire('onPointerCancel');
  assert.equal(h.currentState(), 'idle');

  await h.down({ pointerId: 2 });
  assert.equal(h.currentState(), 'pressing');
  await h.wait(HOLD_THRESHOLD_MS + 20);
  assert.equal(h.currentState(), 'holding');
  await h.fire('onPointerUp', { pointerId: 2 });
  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 2, onHoldEnd: 1, onHoldCancel: 1 });
});

test('vários gestos rápidos consecutivos (toques) nunca se confundem nem acumulam estado entre si', async () => {
  const h = mountHarness();
  for (let i = 0; i < 5; i += 1) {
    await h.down({ pointerId: i });
    await h.fire('onPointerUp', { pointerId: i });
  }
  assert.deepEqual(h.calls, { onTap: 5, onHoldStart: 0, onHoldEnd: 0, onHoldCancel: 0 });
  assert.equal(h.currentState(), 'idle');
});

test('botão de teclado (Enter/Espaço) nunca aciona a rede de segurança de pointer nem trava com Escape', async () => {
  const runtime = createFakeRuntime();
  const h = mountHarness({ runtime });
  await h.fire('onKeyDown', { key: 'Enter' });
  assert.equal(h.currentState(), 'pressing');
  await h.fire('onKeyUp', { key: 'Enter' });
  assert.equal(h.calls.onTap, 1);
  assert.equal(h.currentState(), 'idle');
});

test('Escape cancela um gesto de pointer em andamento e libera o botão', async () => {
  const h = mountHarness();
  await holdPastThreshold(h);
  await h.fire('onKeyDown', { key: 'Escape' });
  assert.deepEqual(h.calls, { onTap: 0, onHoldStart: 1, onHoldEnd: 0, onHoldCancel: 1 });
  assert.equal(h.currentState(), 'idle');
});

test('desmontar durante um hold ativo não deixa nenhum callback pendente: o timeout de segurança é cancelado, nunca dispara onHoldCancel depois do unmount', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = createFakeRuntime();
  const h = mountHarness({ runtime });

  h.down();
  act(() => { t.mock.timers.tick(HOLD_THRESHOLD_MS + 20); });
  assert.equal(h.currentState(), 'holding');

  act(() => { h.unmount(); });
  assert.equal(h.calls.onHoldCancel, 0);

  // Se o timeout de segurança não tivesse sido cancelado no unmount, o
  // avanço abaixo dispararia finishRef contra um componente já desmontado.
  act(() => { t.mock.timers.tick(FAILSAFE_TIMEOUT_MS + 50); });
  assert.equal(h.calls.onHoldCancel, 0);
});

