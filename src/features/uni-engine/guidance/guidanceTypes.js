// Uni Engine — Guidance (Parte 2, Bloco 2: cálculo observacional das
// guidances).
//
// Enum FECHADO e versionamento do módulo observacional. Este módulo calcula e
// consolida as quatro guidances (Question, Clarification, Style, Length) em
// um snapshot SOMENTE em memória. Nunca aplica, nunca altera a resposta,
// nunca escreve memória e nunca executa.
export const GUIDANCE_VERSION = '1.0';

// ÚNICAS capacidades calculadas pelo módulo observacional. Espelham as
// quatro guidances autorizadas da Parte 1; qualquer outra fica de fora.
export const GUIDANCE_CAPABILITIES = Object.freeze([
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
]);

export const GUIDANCE_MODES = Object.freeze(['observational']);

export function isGuidanceCapability(value) {
  return GUIDANCE_CAPABILITIES.includes(value);
}

export function isGuidanceMode(value) {
  return GUIDANCE_MODES.includes(value);
}
