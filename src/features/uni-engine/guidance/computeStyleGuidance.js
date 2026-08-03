// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// Calcula a orientação de estilo (RESPONSE_STYLE_GUIDANCE) como se a
// capacidade estivesse ATIVA, mas SOMENTE para observação. O resultado é um
// objeto em memória que nunca altera o texto, nunca executa e nunca persiste
// nada. Reutiliza o cálculo da Parte 1 (applyResponseStyleGuidance) com
// active:true — a integração existente fica intacta.
import { applyResponseStyleGuidance } from '../integration/applyResponseStyleGuidance.js';

export function computeStyleGuidance({ legacy, suggested = null } = {}) {
  const outcome = applyResponseStyleGuidance({ legacy, suggested, active: true });
  return {
    guidance: {
      ...outcome.guidance,
      observational: true,
    },
  };
}
