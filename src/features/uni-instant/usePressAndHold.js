import { useCallback, useEffect, useRef, useState } from 'react';

export const HOLD_THRESHOLD_MS = 400;
export const CANCEL_DRAG_PX = 56;

export default function usePressAndHold({
  onTap,
  onHoldStart,
  onHoldEnd,
  onHoldCancel,
  externalRef,
}) {
  const [gestureState, setGestureState] = useState('idle');
  const timerRef = useRef(null);
  const pressingRef = useRef(false);
  const holdingRef = useRef(false);
  const sourceRef = useRef(null);
  const pointerIdRef = useRef(null);
  const startPointRef = useRef({ x: 0, y: 0 });
  const internalRef = useRef(null);
  const elementRef = externalRef ?? internalRef;

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const begin = useCallback((source) => {
    if (sourceRef.current) return;
    sourceRef.current = source;
    pressingRef.current = true;
    setGestureState('pressing');
    timerRef.current = setTimeout(() => {
      pressingRef.current = false;
      holdingRef.current = true;
      setGestureState('holding');
      onHoldStart?.();
    }, HOLD_THRESHOLD_MS);
  }, [onHoldStart]);

  const finish = useCallback((canceled = false) => {
    clearTimer();
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
  }, [clearTimer, onHoldCancel, onHoldEnd, onTap]);

  useEffect(() => () => {
    clearTimer();
    const pointerId = pointerIdRef.current;
    if (pointerId !== null && elementRef.current?.hasPointerCapture?.(pointerId)) {
      elementRef.current.releasePointerCapture(pointerId);
    }
  }, [clearTimer, elementRef]);

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
