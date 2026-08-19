// AGPUSH4: assinatura visual POR AÇÃO da microinteração de lembrete.
// Única fonte de verdade dos números -- todo componente que precisa de um
// tempo (feedback do botão, confirmação, recolhimento dos dois modais,
// motor de partícula/contorno/radial/card, revelação do indicador) lê
// daqui, nunca duplica uma constante local.
//
// Três perfis:
// - energetic (30 min antes): rápido, preciso -- total percebido alvo
//   ~1.50s-1.60s.
// - calm (1h antes): suave, deliberado -- NÃO é o energetic desacelerado
//   proporcionalmente; cada fase foi recalibrada -- total percebido alvo
//   ~1.75s-1.85s.
// - none (Não precisa): sem partícula, sem contorno, sem radial, sem
//   indicador -- só confirmação curta + dissolução no próprio modal, alvo
//   ~420ms-480ms.
//
// Cálculo do total percebido (documentado para auditoria futura, mesmo
// método já usado na investigação anterior):
//   confirmMs + modalCollapseMs + formCollapseMs + ~16ms (1 frame de
//   requestAnimationFrame, não configurável) + motorTotalMs
// onde motorTotalMs = max(travelDuration + absorbDuration,
//   ringDelay + ringDuration, glowDelay + glowDuration,
//   cardScaleDelay + cardScaleDuration) -- a fase mais longa decide
//   quando o motor termina de verdade (mesmo raciocínio da auditoria).

export const REMINDER_MOTION_VARIANTS = Object.freeze({
  ENERGETIC: 'energetic',
  CALM: 'calm',
  NONE: 'none',
});

// AGPUSH4: mapeamento explícito offset -> variante -- nunca inferido por
// posição/índice. '30' sempre energetic, '60' sempre calm, 'none' sempre
// none, mesmo que a ordem dos botões mude no futuro.
export const OFFSET_TO_VARIANT = Object.freeze({
  30: REMINDER_MOTION_VARIANTS.ENERGETIC,
  60: REMINDER_MOTION_VARIANTS.CALM,
  none: REMINDER_MOTION_VARIANTS.NONE,
});

// Total percebido (30min): 180 + 220 + 220 + ~16 + 930 = 1566ms (~1.57s),
// dentro do alvo 1.50s-1.60s.
//   motor: max(420+180=600, 210+720=930, 420+300=720, 420+300=720) = 930ms
const ENERGETIC = Object.freeze({
  variant: REMINDER_MOTION_VARIANTS.ENERGETIC,
  feedbackMs: 150,
  confirmMs: 180,
  modalCollapseMs: 220,
  formCollapseMs: 220,
  // Trajetória mais direta -- curva perceptivelmente mais reta que calm.
  trajectoryArcFactor: 0.08,
  trajectoryArcCapPx: 18,
  travelDuration: 420,
  absorbDuration: 180,
  // Contorno começa na metade do trajeto (não espera a chegada completa),
  // fica visível por bastante tempo -- "energia clara, chegando rápido".
  ringDelay: 210,
  ringDuration: 720,
  ringColorEmphasis: 'bright-early', // ciano largo/brilhante desde cedo no arco
  glowDelay: 420,
  glowDuration: 300,
  cardScaleDelay: 420,
  cardScaleDuration: 300,
  // Indicador só entra visualmente depois da absorção (travel+absorb).
  indicatorRevealMs: 200,
});

// Total percebido (1h): 200 + 240 + 240 + ~16 + 1120 = 1816ms (~1.82s),
// dentro do alvo 1.75s-1.85s. NÃO é energetic * fator fixo -- cada fase
// foi recalibrada (ex.: ringDuration cresce 22% mas cardScaleDuration só
// 13%, refletindo que o contorno é o elemento que carrega a sensação de
// "deliberado", não o card reagindo mais forte).
//   motor: max(480+200=680, 240+880=1120, 480+340=820, 480+340=820) = 1120ms
const CALM = Object.freeze({
  variant: REMINDER_MOTION_VARIANTS.CALM,
  feedbackMs: 160,
  confirmMs: 200,
  modalCollapseMs: 240,
  formCollapseMs: 240,
  // Curva um pouco maior que energetic -- ainda "MUITO leve" (ver
  // computeTrajectory), nunca um arco exagerado.
  trajectoryArcFactor: 0.16,
  trajectoryArcCapPx: 34,
  travelDuration: 480,
  absorbDuration: 200,
  ringDelay: 240,
  ringDuration: 880,
  ringColorEmphasis: 'bright-late', // violeta/azul dominam, ciano só perto da cabeça
  glowDelay: 480,
  glowDuration: 340,
  cardScaleDelay: 480,
  cardScaleDuration: 340,
  indicatorRevealMs: 220,
});

// Total percebido ("Não precisa"): 180 + 280 = 460ms, dentro do alvo
// 420ms-480ms. Sem partícula/contorno/radial/indicador -- ver
// AgendaReminderChoiceModal.jsx (offsetMinutes null nunca chega ao motor
// de animação nem ao card).
const NONE = Object.freeze({
  variant: REMINDER_MOTION_VARIANTS.NONE,
  feedbackMs: 150,
  confirmMs: 180,
  modalCollapseMs: 280,
  // dissolveFlash (AgendaReminderChoiceModal.module.css) fica DENTRO da
  // janela de recolhimento -- nunca mais longo que ela (era o bug
  // encontrado na v1: 220ms de flash cortado por um recolhimento de
  // 180ms, terminando 40ms depois do modal já ter fechado).
  dissolveFlashMs: 260,
});

export const REMINDER_MOTION_PROFILES = Object.freeze({
  [REMINDER_MOTION_VARIANTS.ENERGETIC]: ENERGETIC,
  [REMINDER_MOTION_VARIANTS.CALM]: CALM,
  [REMINDER_MOTION_VARIANTS.NONE]: NONE,
});

/** Nunca lança para uma variante desconhecida -- cai no perfil calm (o mais conservador/seguro). */
export function getReminderMotionProfile(variant) {
  return REMINDER_MOTION_PROFILES[variant] ?? CALM;
}

/** offset ('30' | '60' | 'none') -> variante -- nunca por posição no array de botões. */
export function resolveMotionVariantForOffset(offset) {
  return OFFSET_TO_VARIANT[offset] ?? REMINDER_MOTION_VARIANTS.CALM;
}

/**
 * Ponto exato (ms desde o início do motor) em que a partícula termina de
 * ser absorvida -- é quando o indicador do card deve começar sua própria
 * entrada visual (nunca antes, per pedido explícito do refinamento).
 */
export function getAbsorptionCompleteMs(profile) {
  return profile.travelDuration + profile.absorbDuration;
}

/** Instante (ms desde o início do motor) em que a última sub-animação termina. */
export function getMotionEngineTotalMs(profile) {
  return Math.max(
    profile.travelDuration + profile.absorbDuration,
    profile.ringDelay + profile.ringDuration,
    profile.glowDelay + profile.glowDuration,
    profile.cardScaleDelay + profile.cardScaleDuration,
  );
}
