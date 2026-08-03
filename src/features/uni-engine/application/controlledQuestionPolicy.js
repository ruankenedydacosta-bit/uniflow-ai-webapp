// Uni Engine — Controlled Question (Parte 6, Bloco Único): policy fechada.
//
// Reutiliza as políticas públicas existentes da Application Layer
// (confiança, risco, ambiente, autorização, capability) — NÃO duplica nada.
// Define apenas o que é específico da pergunta controlada: a allowlist de
// campos, os templates fechados permitidos e a prioridade determinística
// entre decisões (confirmação legada > Clarification > Question).
import {
  isApplicationEnabledByPolicy,
  isCapabilityAllowedByPolicy,
  isEnvironmentAllowedByPolicy,
  isUserAuthorizedByPolicy,
  isConfidenceAllowedByPolicy,
  isRiskAllowedByPolicy,
} from './applicationPolicy.js';
import {
  ALLOWED_REQUESTED_FIELDS,
  ALLOWED_AMBIGUITY_FIELDS,
  CONTROLLED_QUESTION_CAPABILITIES,
  isAllowedRequestedField,
  isAllowedAmbiguityField,
} from './controlledQuestionTypes.js';

// Prioridade determinística entre decisões (quanto MENOR o número, MAIOR a
// prioridade). A confirmação obrigatória do legado tem precedência absoluta
// e é tratada ANTES da seleção (nunca compete por uma mensagem).
export const CONTROLLED_QUESTION_PRIORITY = Object.freeze({
  CLARIFICATION_GUIDANCE: 1,
  QUESTION_GUIDANCE: 2,
});

export const CONTROLLED_QUESTION_POLICY = Object.freeze({
  version: '1.0',
  minimumConfidence: 0.7,
  maximumRisk: 'MEDIUM',
  confirmationPrecedence: true,
  allowedRequestedFields: ALLOWED_REQUESTED_FIELDS,
  allowedAmbiguityFields: ALLOWED_AMBIGUITY_FIELDS,
  capabilities: CONTROLLED_QUESTION_CAPABILITIES,
  priority: CONTROLLED_QUESTION_PRIORITY,
});

// Templates FECHADOS e explicitamente permitidos. Nenhum valor, nome de conta
// ou categoria inventada entra no texto — a pergunta é sempre literal e
// estática. Confirmação NÃO tem template aqui: usa exclusivamente o mecanismo
// legado já existente.
export const CONTROLLED_QUESTION_TEMPLATES = Object.freeze({
  account: 'Em qual conta foi essa movimentação?',
  category: 'Em qual categoria deseja registrar?',
  transactionType: 'Isso foi uma receita ou uma despesa?',
  amount: 'Qual foi o valor?',
  description: 'Como deseja identificar esse registro?',
  ambiguity_account: 'Qual conta você quis dizer?',
  ambiguity_category: 'Qual categoria corresponde melhor a esse registro?',
  ambiguity_intent: 'Você quer registrar uma movimentação ou consultar seus dados?',
});

export function getControlledQuestionPolicy() {
  return CONTROLLED_QUESTION_POLICY;
}

// Chave de template para um campo de informação ausente (ou null se fora da
// allowlist). O texto vem do mapa fechado — nunca é interpolado.
export function selectControlledQuestionTemplateKey(field) {
  if (isAllowedRequestedField(field)) return field;
  if (isAllowedAmbiguityField(field)) return `ambiguity_${field}`;
  return null;
}

export function selectControlledQuestionTemplate(field) {
  const templateKey = selectControlledQuestionTemplateKey(field);
  if (templateKey === null) return null;
  return CONTROLLED_QUESTION_TEMPLATES[templateKey];
}

// Chave de template considerando o TIPO de decisão: para 'clarification' o
// campo deve ser de ambiguidade (ambiguity_<campo>); para 'question' o campo
// deve ser de informação ausente (template direto). Nunca interpola valores —
// o texto vem exclusivamente do mapa fechado.
export function selectControlledQuestionTemplateKeyForDecisionType(field, decisionType) {
  if (decisionType === 'clarification') {
    return isAllowedAmbiguityField(field) ? `ambiguity_${field}` : null;
  }
  return isAllowedRequestedField(field) ? field : null;
}

export function selectControlledQuestionTemplateForDecisionType(field, decisionType) {
  const templateKey = selectControlledQuestionTemplateKeyForDecisionType(field, decisionType);
  if (templateKey === null) return null;
  return CONTROLLED_QUESTION_TEMPLATES[templateKey];
}

// Prioridade da capability (menor número = maior prioridade).
export function getControlledQuestionPriority(capability) {
  const priority = CONTROLLED_QUESTION_PRIORITY[capability];
  return typeof priority === 'number' ? priority : Infinity;
}

// Gates reutilizados da Application Layer (nunca duplicados):
export {
  isApplicationEnabledByPolicy,
  isCapabilityAllowedByPolicy,
  isEnvironmentAllowedByPolicy,
  isUserAuthorizedByPolicy,
  isConfidenceAllowedByPolicy,
  isRiskAllowedByPolicy,
};

// Interruptor MESTRE da parte (flag VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED,
// false por padrão). Sem ele, nenhuma pergunta controlada é emitida — mesmo
// com a capability flag ligada.
export function isControlledQuestionsEnabledByConfig(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  return safeConfig.controlledQuestionsEnabled === true;
}

// Flag da capability específica (QUESTION_GUIDANCE | CLARIFICATION_GUIDANCE).
// Ausente ou false → nunca emite pergunta.
export function isControlledQuestionCapabilityEnabledByConfig(config, capability) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  return safeConfig.activationCapabilities?.[capability] === true;
}
