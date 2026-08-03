// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// Calcula a orientação de comprimento (RESPONSE_LENGTH_GUIDANCE) como se a
// capacidade estivesse ATIVA, mas SOMENTE para observação. O resultado é um
// objeto em memória que nunca altera o texto, nunca executa e nunca persiste
// nada. Reutiliza o cálculo da Parte 1 (applyResponseLengthGuidance) com
// active:true — a integração existente fica intacta.
import { applyResponseLengthGuidance } from '../integration/applyResponseLengthGuidance.js';

export function computeLengthGuidance({ legacy, suggested = null } = {}) {
  const outcome = applyResponseLengthGuidance({ legacy, suggested, active: true });
  return {
    guidance: {
      ...outcome.guidance,
      observational: true,
    },
  };
}
