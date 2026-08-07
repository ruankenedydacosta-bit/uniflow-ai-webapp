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

    viewport.addEventListener('resize', scheduleSync);
    viewport.addEventListener('scroll', scheduleSync);
    browserRuntime.addEventListener?.('orientationchange', scheduleSync);
    browserRuntime.addEventListener?.('pageshow', scheduleSync);
    scheduleSync();

    return () => {
      viewport.removeEventListener('resize', scheduleSync);
      viewport.removeEventListener('scroll', scheduleSync);
      browserRuntime.removeEventListener?.('orientationchange', scheduleSync);
      browserRuntime.removeEventListener?.('pageshow', scheduleSync);
      if (frame !== null) {
        if (browserRuntime.cancelAnimationFrame) browserRuntime.cancelAnimationFrame(frame);
        else browserRuntime.clearTimeout?.(frame);
      }
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
