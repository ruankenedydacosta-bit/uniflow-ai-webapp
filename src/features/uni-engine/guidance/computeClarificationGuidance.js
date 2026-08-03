// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// Calcula a orientação de esclarecimento (CLARIFICATION_GUIDANCE) como se a
// capacidade estivesse ATIVA, mas SOMENTE para observação. O resultado é um
// objeto em memória que nunca altera o texto, nunca executa e nunca persiste
// nada. Reutiliza o cálculo da Parte 1 (applyClarificationGuidance) com
// active:true — a integração existente fica intacta.
import { applyClarificationGuidance } from '../integration/applyClarificationGuidance.js';

export function computeClarificationGuidance({ legacy, suggested = null } = {}) {
  const outcome = applyClarificationGuidance({ legacy, suggested, active: true });
  return {
    guidance: {
      ...outcome.guidance,
      observational: true,
    },
  };
}
