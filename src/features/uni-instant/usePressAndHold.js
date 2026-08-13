import { useCallback, useEffect, useRef, useState } from 'react';

export const HOLD_THRESHOLD_MS = 400;
export const CANCEL_DRAG_PX = 56;
// Rede de segurança de último recurso: bem abaixo de qualquer duração real de
// interação, só dispara se o navegador nunca entregar NENHUM evento de
// pointer ao elemento (ver SAFETY_NET_EVENTS abaixo) -- garante que o gesto
// nunca fique preso em "holding" para sempre, mesmo nesse caso extremo.
export const FAILSAFE_TIMEOUT_MS = 10_000;
// Eventos que terminam um gesto de pointer independente de QUAL elemento os
// recebe -- capturados na fase de captura em `window`, nunca em `document`
// (mais cedo no percurso, nenhum listener intermediário pode interceptar
// antes). Causa raiz real de dispositivo: setPointerCapture + touch-action:
// none reduzem mas não eliminam 100% os casos em que o navegador reinterpreta
// um arrasto como gesto nativo (scroll/overscroll/bounce) e nunca despacha
// pointerup/pointercancel/lostpointercapture para o elemento que capturou o
// ponteiro -- o gesto ficava preso em "holding" pra sempre porque TODOS os
// caminhos de saída dependiam exclusivamente de um evento chegar até o
// próprio botão. Esta rede não substitui os handlers no elemento (que
// continuam sendo o caminho primário, mais preciso); é um reforço que não
// depende de qual alvo o navegador realmente notifica.
const SAFETY_NET_EVENTS = ['pointerup', 'pointercancel'];

export default function usePressAndHold({
  onTap,
  onHoldStart,
  onHoldEnd,
  onHoldCancel,
  externalRef,
  // Injeção de dependência (mesmo padrão de useUniVoiceInput/
  // mediaRecorderAdapter): permite testar a rede de segurança com um
  // EventTarget falso em vez do `window` real, sem mudar nada em produção
  // (default continua sendo o `window` de verdade).
  runtime,
}) {
  const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
  const [gestureState, setGestureState] = useState('idle');
  const timerRef = useRef(null);
  const failsafeTimerRef = useRef(null);
  const pressingRef = useRef(false);
  const holdingRef = useRef(false);
  const sourceRef = useRef(null);
  const pointerIdRef = useRef(null);
  const startPointRef = useRef({ x: 0, y: 0 });
  const internalRef = useRef(null);
  const elementRef = externalRef ?? internalRef;
  const finishRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearFailsafeTimer = useCallback(() => {
    if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
    failsafeTimerRef.current = null;
  }, []);

  // Ref (nunca recriada por render, ao contrário de uma useCallback comum)
  // para que addEventListener e removeEventListener sempre recebam a MESMA
  // referência de função -- addEventListener/removeEventListener só casam
  // por identidade; se a função fosse recriada a cada render, remove() num
  // render diferente do add() nunca removeria o listener de verdade.
  const handleSafetyNetEventRef = useRef((event) => {
    if (sourceRef.current !== 'pointer' || event.pointerId !== pointerIdRef.current) return;
    finishRef.current?.(true);
  });

  const detachSafetyNet = useCallback(() => {
    clearFailsafeTimer();
    if (!browserRuntime?.removeEventListener) return;
    for (const eventName of SAFETY_NET_EVENTS) {
      browserRuntime.removeEventListener(eventName, handleSafetyNetEventRef.current, true);
    }
  }, [browserRuntime, clearFailsafeTimer]);

  const attachSafetyNet = useCallback(() => {
    if (browserRuntime?.addEventListener) {
      for (const eventName of SAFETY_NET_EVENTS) {
        browserRuntime.addEventListener(eventName, handleSafetyNetEventRef.current, true);
      }
    }
    failsafeTimerRef.current = setTimeout(() => {
      finishRef.current?.(true);
    }, FAILSAFE_TIMEOUT_MS);
  }, [browserRuntime]);

  const begin = useCallback((source) => {
    if (sourceRef.current) return;
    sourceRef.current = source;
    pressingRef.current = true;
    setGestureState('pressing');
    // Teclado nunca simula long press (UX4): segurar Enter/Espaço sempre
    // resolve como toque ao soltar a tecla, por mais tempo que fique
    // pressionada -- a acao principal por teclado continua sendo abrir a
    // Uni, sem um comportamento de captura de voz confuso e sem paralelo
    // visual (o gesto de segurar so faz sentido como toque prolongado real).
    if (source !== 'pointer') return;
    attachSafetyNet();
    timerRef.current = setTimeout(() => {
      pressingRef.current = false;
      holdingRef.current = true;
      setGestureState('holding');
      onHoldStart?.();
    }, HOLD_THRESHOLD_MS);
  }, [attachSafetyNet, onHoldStart]);

  const finish = useCallback((canceled = false) => {
    clearTimer();
    detachSafetyNet();
    const wasPressing = pressingRef.current;
    const wasHolding = holdingRef.current;
    pressingRef.current = false;
    holdingRef.current = false;
    sourceRef.current = null;
    pointerIdRef.current = null;
    setGestureState('idle');

    if (wasHolding) {
      if (canceled) onHoldCancel?.();
      else onHoldEnd?.();
    } else if (wasPressing && !canceled) {
      onTap?.();
    }
  }, [clearTimer, detachSafetyNet, onHoldCancel, onHoldEnd, onTap]);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  useEffect(() => () => {
    clearTimer();
    detachSafetyNet();
    const pointerId = pointerIdRef.current;
    if (pointerId !== null && elementRef.current?.hasPointerCapture?.(pointerId)) {
      elementRef.current.releasePointerCapture(pointerId);
    }
  }, [clearTimer, detachSafetyNet, elementRef]);

  return {
    gestureState,
    bind: {
      ref: elementRef,
      onPointerDown: (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        pointerIdRef.current = event.pointerId;
        startPointRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        begin('pointer');
      },
      onPointerMove: (event) => {
        if (sourceRef.current !== 'pointer' || event.pointerId !== pointerIdRef.current) return;
        const distance = Math.hypot(
          event.clientX - startPointRef.current.x,
          event.clientY - startPointRef.current.y,
        );
        if (distance > CANCEL_DRAG_PX) {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          finish(true);
        }
      },
      onPointerUp: (event) => {
        if (sourceRef.current !== 'pointer' || event.pointerId !== pointerIdRef.current) return;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finish(false);
      },
      onPointerCancel: (event) => {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finish(true);
      },
      // Rede de segurança: se a captura for perdida sem um pointerup/
      // pointercancel correspondente (ex.: o navegador redireciona a
      // captura por conta própria), este é o único evento restante que avisa
      // -- sem ele, o gesto podia ficar "preso" em holding para sempre.
      onLostPointerCapture: (event) => {
        if (sourceRef.current !== 'pointer' || event.pointerId !== pointerIdRef.current) return;
        finish(true);
      },
      onKeyDown: (event) => {
        if (event.key === 'Escape' && sourceRef.current) {
          event.preventDefault();
          finish(true);
          return;
        }
        if (!['Enter', ' '].includes(event.key) || event.repeat || sourceRef.current) return;
        event.preventDefault();
        begin('keyboard');
      },
      onKeyUp: (event) => {
        if (!['Enter', ' '].includes(event.key) || sourceRef.current !== 'keyboard') return;
        event.preventDefault();
        finish(false);
      },
      onContextMenu: (event) => event.preventDefault(),
    },
  };
}
