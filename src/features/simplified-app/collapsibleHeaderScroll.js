import { useEffect, useRef, useState } from 'react';

// COMPACT-HEADER1: valores dentro das faixas pedidas -- descer ~20-30px
// acumulados esconde, subir ~12-20px acumulados reexibe. Histerese via
// acumulador (nunca 1px = 1 decisão) evita o header "piscando" em
// pequenos movimentos/inércia do scroll.
export const COLLAPSIBLE_HEADER_DOWN_THRESHOLD_PX = 24;
export const COLLAPSIBLE_HEADER_UP_THRESHOLD_PX = 16;
// Perto do topo o header SEMPRE fica visível, mesmo que o usuário tenha
// acabado de rolar um pouco para baixo -- "usuário volta ao topo: header
// permanece visível" vale mesmo antes do threshold de subida ser atingido.
export const COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX = 4;

export function createInitialCollapsibleHeaderState() {
  return Object.freeze({ lastScrollTop: 0, downAccum: 0, upAccum: 0, hidden: false });
}

/**
 * COMPACT-HEADER1: reducer puro (sem DOM/timers) -- toda a lógica de
 * histerese testável isoladamente. Recebe o estado anterior e o scrollTop
 * atual do container (.mainContent), devolve o PRÓXIMO estado. Nunca
 * decide "esconder" por 1px isolado: acumula o delta na MESMA direção até
 * cruzar o threshold, e reseta o acumulador da direção oposta a cada
 * inversão de sentido.
 */
export function nextCollapsibleHeaderState(state, scrollTop, {
  downThresholdPx = COLLAPSIBLE_HEADER_DOWN_THRESHOLD_PX,
  upThresholdPx = COLLAPSIBLE_HEADER_UP_THRESHOLD_PX,
  topThresholdPx = COLLAPSIBLE_HEADER_TOP_THRESHOLD_PX,
} = {}) {
  const current = state ?? createInitialCollapsibleHeaderState();
  const safeScrollTop = Math.max(0, Number(scrollTop) || 0);

  if (safeScrollTop <= topThresholdPx) {
    return Object.freeze({ lastScrollTop: safeScrollTop, downAccum: 0, upAccum: 0, hidden: false });
  }

  const delta = safeScrollTop - current.lastScrollTop;
  if (delta > 0) {
    const downAccum = current.downAccum + delta;
    const hidden = current.hidden || downAccum >= downThresholdPx;
    return Object.freeze({ lastScrollTop: safeScrollTop, downAccum, upAccum: 0, hidden });
  }
  if (delta < 0) {
    const upAccum = current.upAccum - delta;
    const hidden = current.hidden && upAccum < upThresholdPx;
    return Object.freeze({ lastScrollTop: safeScrollTop, downAccum: 0, upAccum, hidden });
  }
  return Object.freeze({ ...current, lastScrollTop: safeScrollTop });
}

/**
 * COMPACT-HEADER1: liga o reducer puro acima a um scroll real do
 * container passado via ref. rAF-throttled (no máximo 1 cálculo por
 * frame, nunca 1 por evento de scroll -- scroll passivo dispara com MUITA
 * frequência) e só chama setState quando `hidden` de fato muda (mesmo
 * padrão já usado por useVisualViewport.js: comparação antes de
 * re-renderizar). `enabled=false` desliga o listener inteiro -- usado
 * pelas rotas que não têm este header (Registros/Conta/Chat da Uni).
 */
export function useCollapsibleHeaderOnScroll({ scrollContainerRef, enabled = true, runtime = globalThis } = {}) {
  const [hidden, setHidden] = useState(false);
  const stateRef = useRef(createInitialCollapsibleHeaderState());

  useEffect(() => {
    if (!enabled) {
      // Nunca precisa de setState aqui: o `return enabled ? hidden : false`
      // abaixo já mascara o valor público para false enquanto desabilitado
      // -- só reseta o estado interno para quando for reativado.
      stateRef.current = createInitialCollapsibleHeaderState();
      return undefined;
    }
    const node = scrollContainerRef?.current;
    if (!node?.addEventListener) return undefined;

    let frame = null;
    const handleScroll = () => {
      if (frame !== null) return;
      frame = runtime.requestAnimationFrame?.(() => {
        frame = null;
        const next = nextCollapsibleHeaderState(stateRef.current, node.scrollTop);
        stateRef.current = next;
        setHidden((current) => (current === next.hidden ? current : next.hidden));
      }) ?? null;
    };

    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', handleScroll);
      if (frame !== null) runtime.cancelAnimationFrame?.(frame);
    };
  }, [enabled, scrollContainerRef, runtime]);

  return enabled ? hidden : false;
}
