// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// Calcula a orientação de pergunta (QUESTION_GUIDANCE) como se a capacidade
// estivesse ATIVA, mas SOMENTE para observação. O resultado é um objeto em
// memória que nunca altera o texto, nunca executa e nunca persiste nada.
// Reutiliza o cálculo da Parte 1 (applyQuestionGuidance) com active:true —
// a integração existente fica intacta.
import { applyQuestionGuidance } from '../integration/applyQuestionGuidance.js';

export function computeQuestionGuidance({ legacy, suggested = null } = {}) {
  const outcome = applyQuestionGuidance({ legacy, suggested, active: true });
  return {
    guidance: {
      ...outcome.guidance,
      observational: true,
    },
  };
}
