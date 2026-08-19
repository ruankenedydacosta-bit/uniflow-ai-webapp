// AGPUSH2/AGPUSH4 (microinteracao): a "energia da Uni" que viaja do modal
// ate o card do compromisso quando um lembrete e aplicado.
//
// Puramente visual -- NUNCA decide nada, nunca chama backend, nunca e
// condicao da gravacao. Quem chama so dispara isto DEPOIS que a decisao
// real ja foi persistida com sucesso (ver AgendaReminderChoiceModal):
// se o backend falhar, esta funcao simplesmente nao roda, e a UX nunca
// mente dizendo que o lembrete foi aplicado.
//
// Sem biblioteca de animacao: a auditoria confirmou que o projeto nao usa
// Framer Motion/GSAP/etc, e nao vale adicionar uma dependencia inteira por
// UM efeito. Web Animations API (element.animate) + CSS cobrem tudo aqui,
// animando SOMENTE transform/opacity/filter -- propriedades que o
// compositor resolve na GPU, sem layout thrashing e sem um unico
// setState por frame.
//
// AGPUSH4: os NUMEROS (duracoes/delays) vem sempre de um `profile`
// (agendaReminderMotionProfiles.js) -- este arquivo nunca hardcoda um
// valor de tempo, so orquestra as fases usando o que o perfil informa.
// Isso mantem a assinatura de cada acao (30min "energetic" vs 1h "calm")
// definida em UM lugar so.
//
// Todas as dependencias de ambiente entram por parametro (doc/win/
// classNames), mesmo padrao de mobilePushCapabilities.js -- e o que torna
// este modulo testavel de verdade sob `node --test`, sem jsdom. Em
// particular, o CSS module e importado por quem CHAMA (um componente, que
// ja lida com CSS) e as classes chegam aqui como strings: este arquivo
// segue JavaScript puro, sem nenhum import que o runner de teste nao
// consiga carregar.

// Aceleracao inicial suave + desaceleracao ao entrar no card.
const TRAVEL_EASING = 'cubic-bezier(0.42, 0, 0.18, 1)';
const SOFT_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)';

// Overlay unico por vez: uma segunda execucao (usuario decidindo dois
// compromissos em sequencia) sempre limpa a anterior antes de comecar --
// nunca acumula overlays nem deixa particula orfa no DOM.
let activeCleanup = null;

export function prefersReducedMotion(win = globalThis) {
  try {
    return win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

/**
 * Trajetoria do modal ate o card, em coordenadas de VIEWPORT (os rects ja
 * vem de getBoundingClientRect, e o overlay e position:fixed -- por isso a
 * animacao acerta o destino mesmo com a pagina rolada, sem precisar somar
 * scrollX/scrollY em lugar nenhum).
 *
 * O ponto de chegada nao e o centro geometrico do card: mira a regiao do
 * horario/icone (esquerda), que e onde o indicador de lembrete nasce.
 *
 * AGPUSH4: arcFactor/arcCapPx vem do perfil de movimento -- energetic usa
 * uma curva mais reta, calm uma curva um pouco maior. Ambos os defaults
 * preservam o comportamento original (curva "MUITO leve").
 */
export function computeTrajectory(originRect, targetRect, { arcFactor = 0.12, arcCapPx = 26 } = {}) {
  const from = {
    x: originRect.left + (originRect.width / 2),
    y: originRect.top + (originRect.height / 2),
  };
  const to = {
    x: targetRect.left + Math.min(64, targetRect.width * 0.25),
    y: targetRect.top + (targetRect.height / 2),
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  const arc = Math.min(distance * arcFactor, arcCapPx);
  const perpX = distance === 0 ? 0 : -(dy / distance);
  const perpY = distance === 0 ? 0 : (dx / distance);

  return {
    from,
    to,
    distance,
    control: {
      x: ((from.x + to.x) / 2) + (perpX * arc),
      y: ((from.y + to.y) / 2) + (perpY * arc),
    },
  };
}

/**
 * O destino so e confiavel se o card estiver REALMENTE visivel na
 * viewport. Card desmontado, fora da tela ou com area zero => sem
 * particula (o chamador cai no fallback: fecha o modal com elegancia e o
 * indicador aparece normalmente quando o card voltar a ser renderizado).
 * Nunca damos scroll automatico nem navegamos a tela por conta propria.
 */
export function isUsableTarget(rect, viewport) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  return (
    rect.bottom > 0
    && rect.right > 0
    && rect.top < viewport.height
    && rect.left < viewport.width
  );
}

function createElement(doc, className, cssText) {
  const element = doc.createElement('div');
  element.className = className;
  if (cssText) element.style.cssText = cssText;
  return element;
}

function animate(element, keyframes, options) {
  if (typeof element?.animate !== 'function') return null;
  try {
    return element.animate(keyframes, options);
  } catch {
    return null;
  }
}

function settled(animation) {
  if (!animation?.finished) return Promise.resolve();
  // Uma animacao cancelada rejeita `finished` -- isso nunca pode virar um
  // erro nao tratado: a limpeza do overlay acontece de qualquer forma.
  return animation.finished.catch(() => {});
}

/**
 * Dispara a microinteracao completa: particula luminosa nasce no modal,
 * viaja ate o card, e absorvida por ele, o card acende por dentro, um
 * brilho percorre o contorno e o card responde com um micro-scale.
 *
 * `profile` (agendaReminderMotionProfiles.js) define TODAS as duracoes e
 * a curva da trajetoria -- a assinatura "energetic" (30min) vs "calm"
 * (1h) vem inteiramente dai, nunca de um valor local.
 *
 * `onAbsorbed`, se informado, e chamado no exato instante em que a
 * particula termina de ser absorvida pelo card (travel+absorb) -- usado
 * pelo chamador para so entao revelar visualmente o indicador
 * ("30 min antes"/"1h antes"), nunca antes. Quando a animacao nao roda
 * (reduced motion, sem alvo, fora da viewport), `onAbsorbed` e chamado
 * IMEDIATAMENTE (sincrono, antes de retornar) -- sem particula, nao ha
 * "absorcao" para esperar, e o indicador nunca deve ficar preso atras de
 * uma animacao que nunca vai rodar.
 *
 * Sempre resolve (nunca lanca) com { played, reason } -- o chamador nao
 * precisa tratar erro de animacao.
 */
export async function playReminderAppliedAnimation({
  originRect,
  targetElement,
  profile,
  classNames = {},
  onAbsorbed,
  doc = globalThis.document,
  win = globalThis,
} = {}) {
  activeCleanup?.();
  activeCleanup = null;

  const fireAbsorbedNow = () => {
    try {
      onAbsorbed?.();
    } catch {
      // Callback do chamador nunca pode derrubar o motor de animacao.
    }
  };

  if (!doc?.body || !originRect) {
    fireAbsorbedNow();
    return { played: false, reason: 'unavailable' };
  }

  // Acessibilidade primeiro: quem pediu menos movimento nunca ve a
  // trajetoria. A decisao ja foi persistida e o indicador ja vai aparecer
  // no card -- so o espetaculo e dispensado.
  if (prefersReducedMotion(win)) {
    fireAbsorbedNow();
    return { played: false, reason: 'reduced-motion' };
  }

  if (!targetElement?.getBoundingClientRect) {
    fireAbsorbedNow();
    return { played: false, reason: 'no-target' };
  }

  const targetRect = targetElement.getBoundingClientRect();
  const viewport = {
    width: win?.innerWidth ?? 0,
    height: win?.innerHeight ?? 0,
  };
  if (!isUsableTarget(targetRect, viewport)) {
    fireAbsorbedNow();
    return { played: false, reason: 'target-offscreen' };
  }

  const {
    travelDuration, absorbDuration, glowDelay, glowDuration,
    ringDelay, ringDuration, cardScaleDelay, cardScaleDuration,
    trajectoryArcFactor, trajectoryArcCapPx,
  } = profile;

  const trajectory = computeTrajectory(originRect, targetRect, {
    arcFactor: trajectoryArcFactor,
    arcCapPx: trajectoryArcCapPx,
  });
  const radius = win?.getComputedStyle?.(targetElement)?.borderRadius || '14px';

  const cardBox = `top:${targetRect.top}px;left:${targetRect.left}px;width:${targetRect.width}px;height:${targetRect.height}px;border-radius:${radius};`;

  const overlay = createElement(doc, classNames.overlay ?? '');
  const particle = createElement(doc, classNames.particle ?? '');
  const glow = createElement(doc, classNames.cardGlow ?? '', cardBox);
  // AGPUSH4: classe base (espessura/mascara/posicao, compartilhada) +
  // classe de variante (enfase de cor "bright-early"/"bright-late",
  // ver agendaReminderMotionProfiles.js/ringColorEmphasis) -- combinadas
  // aqui, nunca duas implementacoes de contorno.
  const ringClassName = [classNames.cardRing, classNames.cardRingVariant].filter(Boolean).join(' ');
  const ring = createElement(doc, ringClassName, cardBox);

  overlay.appendChild(glow);
  overlay.appendChild(ring);
  overlay.appendChild(particle);
  doc.body.appendChild(overlay);

  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    overlay.remove?.();
    if (activeCleanup === cleanup) activeCleanup = null;
  };
  activeCleanup = cleanup;

  // FASE 3/4 -- a particula nasce no modal e viaja. Uma unica esfera de
  // energia: nada de chuva de particulas, nada de explosao.
  const travel = animate(
    particle,
    [
      { transform: `translate3d(${trajectory.from.x}px, ${trajectory.from.y}px, 0) scale(0.4)`, opacity: 0 },
      { transform: `translate3d(${trajectory.from.x}px, ${trajectory.from.y}px, 0) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate3d(${trajectory.control.x}px, ${trajectory.control.y}px, 0) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate3d(${trajectory.to.x}px, ${trajectory.to.y}px, 0) scale(0.9)`, opacity: 1 },
    ],
    { duration: travelDuration, easing: TRAVEL_EASING, fill: 'forwards' },
  );

  // FASE 5 -- absorcao: encolhe ate zero enquanto some, exatamente sobre o
  // card (nunca "pousa" e fica parada la). E o momento que dispara
  // onAbsorbed -- a "cabeca" da narrativa que revela o indicador.
  const absorb = animate(
    particle,
    [
      { transform: `translate3d(${trajectory.to.x}px, ${trajectory.to.y}px, 0) scale(0.9)`, opacity: 1 },
      { transform: `translate3d(${trajectory.to.x}px, ${trajectory.to.y}px, 0) scale(0)`, opacity: 0 },
    ],
    { duration: absorbDuration, delay: travelDuration, easing: SOFT_EASING, fill: 'forwards' },
  );
  settled(absorb).then(fireAbsorbedNow);

  // FASE 6 -- luz radial interna: "a informacao entrou no compromisso".
  const glowAnimation = animate(
    glow,
    [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }],
    { duration: glowDuration, delay: glowDelay, easing: SOFT_EASING },
  );

  // FASE 7 -- a energia da uma volta pelo contorno, respeitando o
  // border-radius real do card (lido do computed style, nunca chutado).
  const ringAnimation = animate(
    ring,
    [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.18 },
      { opacity: 1, offset: 0.75 },
      { opacity: 0, offset: 1 },
    ],
    { duration: ringDuration, delay: ringDelay, easing: 'linear' },
  );
  const ringSpin = animate(
    ring,
    [{ '--uf-agenda-ring-angle': '0deg' }, { '--uf-agenda-ring-angle': '360deg' }],
    { duration: ringDuration, delay: ringDelay, easing: 'linear' },
  );

  // FASE 8 -- micro reacao do card. Aplicada no proprio elemento via WAAPI
  // (sem fill), entao o card volta sozinho ao estado original e nenhum
  // estilo inline fica grudado nele depois.
  const cardScale = animate(
    targetElement,
    [{ transform: 'scale(1)' }, { transform: 'scale(1.012)', offset: 0.45 }, { transform: 'scale(1)' }],
    { duration: cardScaleDuration, delay: cardScaleDelay, easing: SOFT_EASING },
  );

  await Promise.all([
    settled(travel), settled(absorb), settled(glowAnimation),
    settled(ringAnimation), settled(ringSpin), settled(cardScale),
  ]);

  cleanup();
  return { played: true, reason: null };
}

/** Cancela e limpa qualquer microinteracao em andamento (unmount/reset). */
export function cancelReminderAppliedAnimation() {
  activeCleanup?.();
  activeCleanup = null;
}
