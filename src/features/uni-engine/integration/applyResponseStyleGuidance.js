// Integration — orientação de estilo (RESPONSE_STYLE_GUIDANCE, Parte 1).
//
// Pode orientar: simple | normal | detailed. NÃO pode alterar conteúdo
// factual nem executar nada. A preferência persistida de conversation_style
// SEMPRE vence a sugestão do motor — a orientação nunca rebaixa o estilo que
// o usuário escolheu. O estilo é aplicado como orientação (banda), nunca
// reescrevendo o texto da resposta.
import {
  mapEngineStyleKey,
} from './integrationPolicy.js';
import { isIntegrationStyleKey } from './integrationTypes.js';

export function applyResponseStyleGuidance({
  legacy,
  suggested = null,
  active = false,
} = {}) {
  const safeSuggested = suggested && typeof suggested === 'object' ? suggested : {};
  const engineStyleKey = mapEngineStyleKey(safeSuggested.styleKey);
  const toneBand = typeof safeSuggested.toneBand === 'string'
    ? safeSuggested.toneBand
    : null;
  const preference = legacy?.conversationStyle ?? null;

  // Preferência persistida vence a sugestão do motor (regra da Parte 1).
  const respectedPreference = preference !== null;
  const styleKey = respectedPreference && isIntegrationStyleKey(preference)
    ? preference
    : engineStyleKey;

  const guidance = {
    styleKey,
    toneBand,
    applied: Boolean(active),
    respectedPreference,
    reason: null,
  };

  if (!active || !legacy) {
    guidance.applied = false;
    guidance.reason = active ? 'LEGACY_MISSING' : 'CAPABILITY_NOT_ACTIVE';
    return { guidance, finalText: legacy?.text ?? null };
  }
  if (legacy.protectedType) {
    // Estilo não altera o texto; protege apenas que nenhuma transformação
    // textual aconteça em confirmação/erro/sucesso (já garantido pelo
    // contrato — sem texto novo aqui).
    guidance.reason = 'PROTECTED_RESPONSE';
    return { guidance, finalText: legacy.text };
  }
  if (!respectedPreference) {
    guidance.reason = 'STYLE_SUGGESTED';
  } else {
    guidance.reason = 'PREFERENCE_RESPECTED';
  }
  return { guidance, finalText: legacy.text };
}
