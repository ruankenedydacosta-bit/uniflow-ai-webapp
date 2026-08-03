// Uni Engine — Controlled Question (Parte 6, Bloco Único): seleção do
// template fechado.
//
// Ponto ÚNICO de seleção do texto da pergunta: mapeia um campo de informação
// ausente (question) ou um campo ambíguo (clarification) para um template
// FECHADO e explicitamente permitido. Nunca interpola valores, nomes de conta
// ou categorias; nunca cria texto fora da allowlist. A deduplicação (mesma
// pergunta já enviada no turno) é aplicada AQUI, de forma determinística.
import {
  selectControlledQuestionTemplateKeyForDecisionType,
  selectControlledQuestionTemplateForDecisionType,
} from './controlledQuestionPolicy.js';

// Seleciona { templateKey, finalQuestion } para um campo, ou null quando:
// - o campo não está na allowlist do tipo de decisão (FIELD_NOT_ALLOWED);
// - não existe template fechado para ele (UNKNOWN_TEMPLATE);
// - a pergunta equivalente já foi enviada neste turno (DUPLICATE_QUESTION).
// O tipo de decisão é obrigatório: 'question' usa a allowlist de campos
// ausentes; 'clarification' usa a allowlist de campos ambíguos (ambiguity_*).
export function selectControlledQuestionTemplateSafe({
  field,
  decisionType = 'question',
  alreadyAskedFields = [],
} = {}) {
  if (typeof field !== 'string' || field.trim() === '') {
    return { templateKey: null, finalQuestion: null, blockReason: 'UNKNOWN_TEMPLATE' };
  }
  const templateKey = selectControlledQuestionTemplateKeyForDecisionType(field.trim(), decisionType);
  if (templateKey === null) {
    return {
      templateKey: null,
      finalQuestion: null,
      blockReason: decisionType === 'clarification' ? 'UNKNOWN_TEMPLATE' : 'FIELD_NOT_ALLOWED',
    };
  }
  const finalQuestion = selectControlledQuestionTemplateForDecisionType(field.trim(), decisionType);
  if (typeof finalQuestion !== 'string' || finalQuestion.trim() === '') {
    return { templateKey: null, finalQuestion: null, blockReason: 'UNKNOWN_TEMPLATE' };
  }
  if (Array.isArray(alreadyAskedFields) && alreadyAskedFields.includes(templateKey)) {
    return { templateKey: null, finalQuestion: null, blockReason: 'DUPLICATE_QUESTION' };
  }
  return { templateKey, finalQuestion, blockReason: null };
}
