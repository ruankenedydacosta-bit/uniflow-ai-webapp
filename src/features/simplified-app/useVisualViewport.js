import { useEffect, useMemo, useState } from 'react';

export function readVisualViewport(runtime = globalThis) {
  const viewport = runtime?.visualViewport;
  const fallbackHeight = Number(runtime?.innerHeight) || 0;
  const height = Math.max(0, Math.round(Number(viewport?.height) || fallbackHeight));
  const offsetTop = Math.max(0, Math.round(Number(viewport?.offsetTop) || 0));
  const layoutHeight = Math.max(height, Math.round(fallbackHeight));
  const keyboardInset = Math.max(0, layoutHeight - height - offsetTop);

  return Object.freeze({ height, offsetTop, keyboardInset });
}

export function useVisualViewport(runtime) {
  const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
  const [metrics, setMetrics] = useState(() => readVisualViewport(browserRuntime));

  useEffect(() => {
    const viewport = browserRuntime?.visualViewport;
    if (!viewport?.addEventListener) return undefined;

    let frame = null;
    const settleTimers = new Set();
    const syncMetrics = () => {
      frame = null;
      const next = readVisualViewport(browserRuntime);
      setMetrics((current) => (
        current.height === next.height
        && current.offsetTop === next.offsetTop
        && current.keyboardInset === next.keyboardInset
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

    viewport.addEventListener('resize', scheduleSettledSync);
    viewport.addEventListener('scroll', scheduleSettledSync);
    browserRuntime.addEventListener?.('resize', scheduleSettledSync);
    browserRuntime.addEventListener?.('orientationchange', scheduleSettledSync);
    browserRuntime.addEventListener?.('pageshow', scheduleSettledSync);
    browserRuntime.document?.addEventListener?.('focusout', scheduleSettledSync);
    browserRuntime.document?.addEventListener?.('visibilitychange', handleVisibilityChange);
    scheduleSettledSync();

    return () => {
      viewport.removeEventListener('resize', scheduleSettledSync);
      viewport.removeEventListener('scroll', scheduleSettledSync);
      browserRuntime.removeEventListener?.('resize', scheduleSettledSync);
      browserRuntime.removeEventListener?.('orientationchange', scheduleSettledSync);
      browserRuntime.removeEventListener?.('pageshow', scheduleSettledSync);
      browserRuntime.document?.removeEventListener?.('focusout', scheduleSettledSync);
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

  return useMemo(() => ({
    '--uf-visual-viewport-height': hasVisualViewport && metrics.height > 0
      ? `${metrics.height}px`
      : '100dvh',
    '--uf-visual-viewport-offset-top': hasVisualViewport ? `${metrics.offsetTop}px` : '0px',
    '--uf-keyboard-inset': hasVisualViewport ? `${metrics.keyboardInset}px` : '0px',
  }), [hasVisualViewport, metrics]);
}
