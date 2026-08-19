import { useEffect, useRef, useState } from 'react';

// HEADER-SCROLL2: distância (em px de scroll acumulado na mesma direção)
// para o header ir de 100% visível a 100% escondido. ~80px pedido --
// contínuo, nunca um salto binário num threshold único.
export const HEADER_FADE_DISTANCE_PX = 80;
// Perto do topo o header SEMPRE fica 100% visível (progress=0), mesmo que
// o usuário tenha acabado de descer um pouco -- overscroll/rubber-band no
// topo nunca conta como "desceu".
export const HEADER_TOP_THRESHOLD_PX = 4;
// A partir daqui o header é tratado como "efetivamente escondido" para
// fins de acessibilidade (aria-hidden/pointer-events/tabIndex) -- nunca
// captura toque enquanto quase invisível, mesmo 1-2% antes do fade
// terminar visualmente.
export const HEADER_EFFECTIVELY_HIDDEN_PROGRESS = 0.92;
// Histerese só para a troca de interatividade (evita "piscar" o
// aria-hidden bem na borda) -- a troca de volta para interativo acontece
// um pouco ANTES do progress voltar a 0, nunca exatamente no mesmo ponto
// onde ficou não-interativo.
export const HEADER_EFFECTIVELY_VISIBLE_PROGRESS = 0.85;
// Snap-settle (opcional): se o scroll parar com o header "no meio do
// caminho" (nem claramente visível nem claramente escondido), completa
// suavemente para o extremo mais próximo -- nunca deixa preso numa
// posição estranha.
export const HEADER_SETTLE_IDLE_MS = 150;
export const HEADER_SETTLE_HIDE_PROGRESS = 0.85;
export const HEADER_SETTLE_SHOW_PROGRESS = 0.15;
const HEADER_SETTLE_DURATION_MS = 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * HEADER-SCROLL2: reducer puro (sem DOM/timers) -- toda a matemática do
 * fade contínuo, testável isoladamente. `previousProgress` e `scrollTop`
 * entram, o PRÓXIMO progress (0..1) sai. Não existe mais um "hidden"
 * binário aqui -- só um número contínuo, e pequenos movimentos nunca
 * "piscam" porque nunca há uma decisão discreta, só um incremento
 * proporcional ao delta.
 */
export function nextHeaderProgress(previousProgress, scrollTop, previousScrollTop, {
  fadeDistancePx = HEADER_FADE_DISTANCE_PX,
  topThresholdPx = HEADER_TOP_THRESHOLD_PX,
} = {}) {
  const safeScrollTop = Math.max(0, Number(scrollTop) || 0);
  if (safeScrollTop <= topThresholdPx) return 0;

  const delta = safeScrollTop - (Number(previousScrollTop) || 0);
  const safeFadeDistance = fadeDistancePx > 0 ? fadeDistancePx : HEADER_FADE_DISTANCE_PX;
  return clamp((Number(previousProgress) || 0) + delta / safeFadeDistance, 0, 1);
}

/**
 * HEADER-SCROLL2: decide se o header deve virar não-interativo (ver
 * pointer-events/aria-hidden) a partir do progress atual e do estado
 * anterior -- histerese simples (dois thresholds) para nunca alternar na
 * borda.
 */
export function nextHeaderEffectivelyHidden(previousHidden, progress, {
  hideAtProgress = HEADER_EFFECTIVELY_HIDDEN_PROGRESS,
  showAtProgress = HEADER_EFFECTIVELY_VISIBLE_PROGRESS,
} = {}) {
  if (progress >= hideAtProgress) return true;
  if (progress <= showAtProgress) return false;
  return Boolean(previousHidden);
}

function easeOutCubic(t) {
  const inverted = 1 - t;
  return 1 - inverted * inverted * inverted;
}

/**
 * HEADER-SCROLL2: liga a matemática pura acima a um scroll real. Nunca
 * setState React por frame -- o progress contínuo é escrito direto via
 * `shellRef.current.style.setProperty('--header-progress', ...)` (custom
 * property herdada por TODO o CSS do header/mainContent/dropdown que
 * depende dela, ver simplifiedApp.module.css). Só existe UM setState
 * (isEffectivelyHidden) e só dispara nas raras trocas de interatividade,
 * nunca a cada pixel de scroll.
 *
 * Snap-settle: se o scroll fica parado (HEADER_SETTLE_IDLE_MS) com o
 * progress "no meio do caminho", um tween curto (JS, não CSS transition
 * -- nunca compete com o scroll ao vivo) completa para o extremo mais
 * próximo. prefers-reduced-motion pula direto para o extremo, sem tween.
 */
export function useCollapsibleHeaderOnScroll({
  scrollContainerRef,
  shellRef,
  enabled = true,
  runtime = globalThis,
  fadeDistancePx = HEADER_FADE_DISTANCE_PX,
} = {}) {
  const [isEffectivelyHidden, setIsEffectivelyHidden] = useState(false);
  const progressRef = useRef(0);
  const effectivelyHiddenRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      progressRef.current = 0;
      return undefined;
    }
    const scrollNode = scrollContainerRef?.current;
    const shellNode = shellRef?.current;
    if (!scrollNode?.addEventListener || !shellNode?.style) return undefined;

    const prefersReducedMotion = runtime.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    let rafId = null;
    let settleTimerId = null;
    let settleAnimationId = null;
    let lastScrollTop = Math.max(0, scrollNode.scrollTop);

    const applyProgress = (progress) => {
      progressRef.current = progress;
      shellNode.style.setProperty('--header-progress', String(progress));
      const nextHidden = nextHeaderEffectivelyHidden(effectivelyHiddenRef.current, progress);
      if (nextHidden !== effectivelyHiddenRef.current) {
        effectivelyHiddenRef.current = nextHidden;
        setIsEffectivelyHidden(nextHidden);
      }
    };

    const clearSettleTimer = () => {
      if (settleTimerId !== null) {
        runtime.clearTimeout?.(settleTimerId);
        settleTimerId = null;
      }
    };
    const cancelSettleAnimation = () => {
      if (settleAnimationId !== null) {
        runtime.cancelAnimationFrame?.(settleAnimationId);
        settleAnimationId = null;
      }
    };

    const runSettle = () => {
      const current = progressRef.current;
      if (current > HEADER_SETTLE_SHOW_PROGRESS && current < HEADER_SETTLE_HIDE_PROGRESS) {
        const target = current >= 0.5 ? 1 : 0;
        if (prefersReducedMotion) {
          applyProgress(target);
          return;
        }
        const from = current;
        const startedAt = runtime.performance?.now?.() ?? Date.now();
        const tick = () => {
          const now = runtime.performance?.now?.() ?? Date.now();
          const t = clamp((now - startedAt) / HEADER_SETTLE_DURATION_MS, 0, 1);
          applyProgress(from + (target - from) * easeOutCubic(t));
          if (t < 1) {
            settleAnimationId = runtime.requestAnimationFrame?.(tick) ?? null;
          } else {
            settleAnimationId = null;
          }
        };
        settleAnimationId = runtime.requestAnimationFrame?.(tick) ?? null;
      }
    };

    const scheduleSettle = () => {
      clearSettleTimer();
      settleTimerId = runtime.setTimeout?.(() => {
        settleTimerId = null;
        runSettle();
      }, HEADER_SETTLE_IDLE_MS) ?? null;
    };

    const handleScroll = () => {
      cancelSettleAnimation();
      if (rafId !== null) return;
      rafId = runtime.requestAnimationFrame?.(() => {
        rafId = null;
        const scrollTop = Math.max(0, scrollNode.scrollTop);
        const next = nextHeaderProgress(progressRef.current, scrollTop, lastScrollTop, { fadeDistancePx });
        lastScrollTop = scrollTop;
        applyProgress(next);
        scheduleSettle();
      }) ?? null;
    };

    scrollNode.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollNode.removeEventListener('scroll', handleScroll);
      if (rafId !== null) runtime.cancelAnimationFrame?.(rafId);
      clearSettleTimer();
      cancelSettleAnimation();
      shellNode.style?.setProperty?.('--header-progress', '0');
    };
  }, [enabled, scrollContainerRef, shellRef, runtime, fadeDistancePx]);

  return enabled ? isEffectivelyHidden : false;
}
