// Integration — orientação de comprimento (RESPONSE_LENGTH_GUIDANCE,
// Parte 1).
//
// Pode reduzir excesso de texto. Limites existentes da Uni preservados:
// confirmação curta, consulta objetiva, recomendação curta e detalhada
// somente sob demanda (preferência detailed nunca é encurtada). O texto
// legado SÓ é encurtado quando existe uma forma curta segura e conhecida
// (par long→short fechado) — conteúdo essencial nunca é removido.
import {
  findShortForm,
  mapEngineLengthBand,
  INTEGRATION_POLICY,
} from './integrationPolicy.js';

export function applyResponseLengthGuidance({
  legacy,
  suggested = null,
  active = false,
} = {}) {
  const safeSuggested = suggested && typeof suggested === 'object' ? suggested : {};
  const lengthBand = mapEngineLengthBand(safeSuggested.lengthBand);

  const guidance = {
    lengthBand,
    applied: false,
    truncatedFrom: null,
    truncatedTo: null,
    reason: null,
  };

  if (!active || !legacy) {
    guidance.reason = active ? 'LEGACY_MISSING' : 'CAPABILITY_NOT_ACTIVE';
    return { guidance, finalText: legacy?.text ?? null };
  }
  if (legacy.protectedType) {
    guidance.reason = 'PROTECTED_RESPONSE';
    return { guidance, finalText: legacy.text };
  }
  // Detalhada somente sob demanda: preferência detailed nunca é encurtada.
  if (legacy.conversationStyle === 'detailed') {
    guidance.reason = 'DETAILED_PREFERENCE_PRESERVED';
    return { guidance, finalText: legacy.text };
  }
  if (lengthBand === 'detailed') {
    guidance.reason = 'DETAILED_ON_DEMAND_ONLY';
    return { guidance, finalText: legacy.text };
  }
  const tooLong = legacy.text.length > INTEGRATION_POLICY.maxTextLength;
  const shouldShorten = lengthBand === 'short' || tooLong;
  if (!shouldShorten) {
    guidance.reason = 'WITHIN_LIMIT';
    return { guidance, finalText: legacy.text };
  }

  const shortForm = findShortForm(legacy.text);
  if (!shortForm) {
    guidance.reason = 'NO_SAFE_SHORT_FORM';
    return { guidance, finalText: legacy.text };
  }

  guidance.applied = true;
  guidance.truncatedFrom = legacy.text.length;
  guidance.truncatedTo = shortForm.length;
  guidance.reason = 'SAFE_SHORT_FORM_APPLIED';
  return { guidance, finalText: shortForm };
}
