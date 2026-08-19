import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAbsorptionCompleteMs,
  getMotionEngineTotalMs,
  getReminderMotionProfile,
  OFFSET_TO_VARIANT,
  REMINDER_MOTION_PROFILES,
  REMINDER_MOTION_VARIANTS,
  resolveMotionVariantForOffset,
} from './agendaReminderMotionProfiles.js';

// ============================================================================
// AGPUSH4 -- fonte unica dos numeros de cada assinatura de movimento
// (energetic/calm/none). Todo componente le daqui; estes testes provam os
// numeros em si, independente de quem os consome.
// ============================================================================

test('offset -> variante e mapeado explicitamente -- nunca por posicao no array de botoes', () => {
  assert.equal(OFFSET_TO_VARIANT[30], 'energetic');
  assert.equal(OFFSET_TO_VARIANT[60], 'calm');
  assert.equal(OFFSET_TO_VARIANT.none, 'none');
  assert.equal(resolveMotionVariantForOffset('30'), REMINDER_MOTION_VARIANTS.ENERGETIC);
  assert.equal(resolveMotionVariantForOffset('60'), REMINDER_MOTION_VARIANTS.CALM);
  assert.equal(resolveMotionVariantForOffset('none'), REMINDER_MOTION_VARIANTS.NONE);
});

test('variante desconhecida cai no perfil calm (mais conservador) -- nunca lanca', () => {
  assert.equal(resolveMotionVariantForOffset('90'), REMINDER_MOTION_VARIANTS.CALM);
  assert.equal(getReminderMotionProfile('inexistente'), REMINDER_MOTION_PROFILES.calm);
});

test('energetic (30min): total percebido 1566ms, dentro do alvo 1500-1600ms pedido', () => {
  const profile = REMINDER_MOTION_PROFILES.energetic;
  const total = profile.confirmMs + profile.modalCollapseMs + profile.formCollapseMs
    + 16 + getMotionEngineTotalMs(profile);
  assert.equal(total, 1566);
  assert.ok(total >= 1500 && total <= 1600);
});

test('calm (1h): total percebido 1816ms, dentro do alvo 1750-1850ms pedido', () => {
  const profile = REMINDER_MOTION_PROFILES.calm;
  const total = profile.confirmMs + profile.modalCollapseMs + profile.formCollapseMs
    + 16 + getMotionEngineTotalMs(profile);
  assert.equal(total, 1816);
  assert.ok(total >= 1750 && total <= 1850);
});

test('none ("Não precisa"): total 460ms, dentro do alvo 420-480ms pedido -- sem particula/contorno/radial/indicador', () => {
  const profile = REMINDER_MOTION_PROFILES.none;
  const total = profile.confirmMs + profile.modalCollapseMs;
  assert.equal(total, 460);
  assert.ok(total >= 420 && total <= 480);
  assert.equal('travelDuration' in profile, false, 'none nunca define fases de particula/contorno');
  assert.equal('ringDuration' in profile, false);
  assert.equal('indicatorRevealMs' in profile, false);
});

test('none: o dissolveFlash cabe DENTRO da janela de recolhimento -- nunca é cortado (bug encontrado na v1)', () => {
  const profile = REMINDER_MOTION_PROFILES.none;
  assert.ok(
    profile.dissolveFlashMs <= profile.modalCollapseMs,
    `dissolveFlashMs (${profile.dissolveFlashMs}) precisa caber dentro de modalCollapseMs (${profile.modalCollapseMs})`,
  );
});

test('a confirmação nunca é cortada pelo próprio hold -- confirmMs é o tempo que a confirmação fica visível E sua própria animação de entrada usa o mesmo valor (ver AgendaReminderChoiceModal.module.css)', () => {
  // Bug da v1: confirmationIn durava 160ms mas o hold só esperava 120ms,
  // cortando a animação aos 75% do curso. Aqui garantimos que os
  // consumidores (CSS) recebem o MESMO confirmMs para os dois usos --
  // a prova de que nunca mais desalinham é o teste estrutural em
  // AgendaReminderChoiceModal.test.js que confere a var(--uf-agenda-confirm-ms)
  // tanto no hold em JS quanto na keyframe em CSS.
  for (const profile of Object.values(REMINDER_MOTION_PROFILES)) {
    assert.ok(profile.confirmMs > 0);
  }
});

test('getMotionEngineTotalMs e getAbsorptionCompleteMs concordam: absorção sempre termina antes (ou junto) do motor inteiro', () => {
  for (const variant of [REMINDER_MOTION_VARIANTS.ENERGETIC, REMINDER_MOTION_VARIANTS.CALM]) {
    const profile = REMINDER_MOTION_PROFILES[variant];
    assert.ok(getAbsorptionCompleteMs(profile) <= getMotionEngineTotalMs(profile));
  }
});

test('calm tem trajetória mais curva que energetic (fator e teto maiores)', () => {
  const energetic = REMINDER_MOTION_PROFILES.energetic;
  const calm = REMINDER_MOTION_PROFILES.calm;
  assert.ok(calm.trajectoryArcFactor > energetic.trajectoryArcFactor);
  assert.ok(calm.trajectoryArcCapPx > energetic.trajectoryArcCapPx);
});

test('perfis sao imutaveis (Object.freeze) -- nenhum componente pode mutar o timing de outro por acidente', () => {
  assert.throws(() => { REMINDER_MOTION_PROFILES.energetic.travelDuration = 1; }, TypeError);
  assert.throws(() => { OFFSET_TO_VARIANT[30] = 'calm'; }, TypeError);
});
