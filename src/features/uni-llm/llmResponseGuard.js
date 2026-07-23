// Validacao/guarda da resposta do LLM antes de exibi-la ao usuario.
//
// Objetivos:
// - Rejeitar respostas vazias ou fora de um limite de tamanho.
// - Impedir que o LLM dispare acoes financeiras diretas. Se a resposta contiver
//   algo que pareca uma acao financeira ESTRUTURADA (JSON de acao, comando de
//   execucao/criacao de transacao), a resposta e considerada INVALIDA e o
//   orquestrador cai no fluxo deterministico (que exige confirmacao explicita).

export const MAX_RESPONSE_CHARS = 1500;

// Padroes que sugerem uma acao financeira estruturada / tentativa de execucao.
const STRUCTURED_ACTION_PATTERNS = [
  /"?action"?\s*:\s*"?(create|update|delete|execute|registrar|criar|excluir|alterar)/i,
  /\b(execute|executar|confirmar\s+automaticamente|aplicar\s+agora)\s*[:(]/i,
  /```(?:json)?[\s\S]*"(amount|valor|transaction|account|conta)"[\s\S]*```/i,
  /\bfunction_call\b|\btool_call\b/i,
];

export function looksLikeStructuredFinancialAction(text) {
  if (typeof text !== 'string') return false;
  return STRUCTURED_ACTION_PATTERNS.some((re) => re.test(text));
}

export function validateLlmResponse(text) {
  if (typeof text !== 'string') {
    return { valid: false, reason: 'not_string' };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, reason: 'empty' };
  }
  if (trimmed.length > MAX_RESPONSE_CHARS) {
    return { valid: false, reason: 'too_long' };
  }
  if (looksLikeStructuredFinancialAction(trimmed)) {
    return { valid: false, reason: 'financial_action' };
  }
  return { valid: true, text: trimmed };
}
