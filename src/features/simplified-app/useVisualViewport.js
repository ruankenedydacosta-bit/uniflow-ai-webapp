import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const KEYBOARD_MINIMUM_INSET = 120;
const KEYBOARD_VIEWPORT_RATIO = 0.18;

const DEFAULT_VISUAL_VIEWPORT_STATE = Object.freeze({
  isKeyboardOpen: false,
  metrics: Object.freeze({ height: 0, offsetTop: 0, keyboardInset: 0, layoutHeight: 0 }),
  viewportStyle: Object.freeze({
    '--uf-visual-viewport-height': '100dvh',
    '--uf-visual-viewport-offset-top': '0px',
    '--uf-keyboard-inset': '0px',
  }),
});

export const VisualViewportContext = createContext(DEFAULT_VISUAL_VIEWPORT_STATE);

export function useVisualViewportContext() {
  return useContext(VisualViewportContext);
}

export function isTextEntryElement(element) {
  if (!element || element.disabled || element.readOnly) return false;
  if (element.isContentEditable) return true;
  const tagName = String(element.tagName || '').toLowerCase();
  if (tagName === 'textarea') return true;
  if (tagName !== 'input') return false;
  return !['button', 'checkbox', 'file', 'hidden', 'radio', 'range', 'reset', 'submit'].includes(
    String(element.type || 'text').toLowerCase(),
  );
}

export function readVisualViewport(runtime = globalThis, baselineHeight = 0) {
  const viewport = runtime?.visualViewport;
  const fallbackHeight = Number(runtime?.innerHeight) || 0;
  const height = Math.max(0, Math.round(Number(viewport?.height) || fallbackHeight));
  const offsetTop = Math.max(0, Math.round(Number(viewport?.offsetTop) || 0));
  const layoutHeight = Math.max(height, Math.round(fallbackHeight), Math.round(baselineHeight));
  const keyboardInset = Math.max(0, layoutHeight - height - offsetTop);

  return Object.freeze({ height, offsetTop, keyboardInset, layoutHeight });
}

export function resolveKeyboardVisibility({ metrics, hasVisualViewport, activeElement } = {}) {
  if (!hasVisualViewport) return isTextEntryElement(activeElement);
  const layoutHeight = Number(metrics?.layoutHeight) || 0;
  const threshold = Math.max(KEYBOARD_MINIMUM_INSET, Math.round(layoutHeight * KEYBOARD_VIEWPORT_RATIO));
  return Number(metrics?.keyboardInset) >= threshold;
}

export function useVisualViewport(runtime) {
  const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
  const initialBaselineHeight = Math.max(
    Number(browserRuntime?.innerHeight) || 0,
    Number(browserRuntime?.visualViewport?.height) || 0,
  );
  const [isTextEntryFocused, setIsTextEntryFocused] = useState(() => (
    isTextEntryElement(browserRuntime?.document?.activeElement)
  ));
  const baselineHeightRef = useRef(initialBaselineHeight);
  const [metrics, setMetrics] = useState(() => readVisualViewport(
    browserRuntime,
    initialBaselineHeight,
  ));

  useEffect(() => {
    const viewport = browserRuntime?.visualViewport;
    const eventTarget = viewport?.addEventListener ? viewport : browserRuntime;
    if (!eventTarget?.addEventListener) return undefined;

    let frame = null;
    const settleTimers = new Set();
    const syncMetrics = () => {
      frame = null;
      const textEntryFocused = isTextEntryElement(browserRuntime?.document?.activeElement);
      setIsTextEntryFocused(textEntryFocused);
      if (!textEntryFocused) {
        baselineHeightRef.current = Math.max(
          Number(browserRuntime?.innerHeight) || 0,
          Number(viewport?.height) || 0,
        );
      }
      const next = readVisualViewport(browserRuntime, baselineHeightRef.current);
      setMetrics((current) => (
        current.height === next.height
        && current.offsetTop === next.offsetTop
        && current.keyboardInset === next.keyboardInset
        && current.layoutHeight === next.layoutHeight
          ? current
          : next
      ));
    };
    const scheduleSync = () => {
      if (frame !== null) return;
      frame = browserRuntime.requestAnimationFrame?.(syncMetrics)
        ?? browserRuntime.setTimeout?.(syncMetrics, 0)
        ?? null;
    };
    const scheduleSettledSync = () => {
      settleTimers.forEach((timer) => browserRuntime.clearTimeout?.(timer));
      settleTimers.clear();
      scheduleSync();
      [120, 360].forEach((delay) => {
        const timer = browserRuntime.setTimeout?.(() => {
          settleTimers.delete(timer);
          scheduleSync();
        }, delay);
        if (timer !== undefined) settleTimers.add(timer);
      });
    };
    const handleVisibilityChange = () => {
      if (browserRuntime.document?.visibilityState !== 'hidden') scheduleSettledSync();
    };
    const handleFocusChange = () => {
      setIsTextEntryFocused(isTextEntryElement(browserRuntime?.document?.activeElement));
      scheduleSettledSync();
    };
    const handleOrientationChange = () => {
      baselineHeightRef.current = Math.max(
        Number(browserRuntime?.innerHeight) || 0,
        Number(viewport?.height) || 0,
      );
      scheduleSettledSync();
    };

    viewport?.addEventListener?.('resize', scheduleSettledSync);
    viewport?.addEventListener?.('scroll', scheduleSettledSync);
    browserRuntime.addEventListener?.('resize', scheduleSettledSync);
    browserRuntime.addEventListener?.('orientationchange', handleOrientationChange);
    browserRuntime.addEventListener?.('pageshow', scheduleSettledSync);
    browserRuntime.document?.addEventListener?.('focusin', handleFocusChange);
    browserRuntime.document?.addEventListener?.('focusout', handleFocusChange);
    browserRuntime.document?.addEventListener?.('visibilitychange', handleVisibilityChange);
    scheduleSettledSync();

    return () => {
      viewport?.removeEventListener?.('resize', scheduleSettledSync);
      viewport?.removeEventListener?.('scroll', scheduleSettledSync);
      browserRuntime.removeEventListener?.('resize', scheduleSettledSync);
      browserRuntime.removeEventListener?.('orientationchange', handleOrientationChange);
      browserRuntime.removeEventListener?.('pageshow', scheduleSettledSync);
      browserRuntime.document?.removeEventListener?.('focusin', handleFocusChange);
      browserRuntime.document?.removeEventListener?.('focusout', handleFocusChange);
      browserRuntime.document?.removeEventListener?.('visibilitychange', handleVisibilityChange);
      if (frame !== null) {
        if (browserRuntime.cancelAnimationFrame) browserRuntime.cancelAnimationFrame(frame);
        else browserRuntime.clearTimeout?.(frame);
      }
      settleTimers.forEach((timer) => browserRuntime.clearTimeout?.(timer));
      settleTimers.clear();
    };
  }, [browserRuntime]);

  const hasVisualViewport = Boolean(browserRuntime?.visualViewport);
  const activeElement = isTextEntryFocused ? browserRuntime?.document?.activeElement : null;
  const isKeyboardOpen = resolveKeyboardVisibility({ metrics, hasVisualViewport, activeElement });

  return useMemo(() => ({
    isKeyboardOpen,
    metrics,
    viewportStyle: {
      '--uf-visual-viewport-height': hasVisualViewport && metrics.height > 0
        ? `${metrics.height}px`
        : '100dvh',
      '--uf-visual-viewport-offset-top': hasVisualViewport ? `${metrics.offsetTop}px` : '0px',
      '--uf-keyboard-inset': hasVisualViewport ? `${metrics.keyboardInset}px` : '0px',
    },
  }), [hasVisualViewport, isKeyboardOpen, metrics]);
}
