// OPENAI3: separação explícita entre os dois modos de operação da Uni.
// FINANCIAL é o modo já existente (chat principal, com resumo financeiro
// do usuário). SUPPORT é o modo novo desta fase, para dúvidas sobre o
// produto -- recebe conhecimento de produto recuperado (nunca o manual
// inteiro) e nunca recebe o resumo financeiro detalhado do usuário.
export const UNI_MODE = Object.freeze({
  FINANCIAL: 'financial',
  SUPPORT: 'support',
});

export function isValidUniMode(value) {
  return value === UNI_MODE.FINANCIAL || value === UNI_MODE.SUPPORT;
}
