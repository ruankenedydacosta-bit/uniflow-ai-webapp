// Validacao/guarda da resposta do LLM antes de exibi-la ao usuario.
//
// Objetivos:
// - Rejeitar respostas vazias.
// - BLOCO A1: respostas fora do limite de tamanho nao sao mais descartadas
//   inteiras -- sao resumidas (corte gracioso na ultima fronteira de frase
//   antes do limite), preservando a resposta em vez de forcar o fluxo
//   generico de fallback. So descarta se o resumo ficar vazio.
// - Impedir que o LLM dispare acoes financeiras diretas. Se a resposta contiver
//   algo que pareca uma acao financeira ESTRUTURADA (JSON de acao, comando de
//   execucao/criacao de transacao), a resposta e considerada INVALIDA e o
//   orquestrador cai no fluxo deterministico (que exige confirmacao explicita).

export const MAX_RESPONSE_CHARS = 1500;

// Fronteiras de frase aceitas para o corte gracioso -- ponto, exclamacao,
// interrogacao ou quebra de linha dupla (fim de paragrafo/item de lista).
const SENTENCE_BOUNDARY_RE = /[.!?]|\n\n/g;
// Nunca corta abaixo disso -- um "resumo" com poucas palavras nao ajuda o
// usuario. Se nenhuma fronteira de frase existir depois desse minimo, cai
// no corte duro (hardCharLimit) em vez de devolver so 1 palavra.
const MIN_SUMMARY_CHARS = 40;

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

// Corta `text` no limite de fronteira de frase mais proximo (e <=) de
// `hardCharLimit`, incluindo o caractere de pontuacao. Sem fronteira valida
// depois do minimo, cai no corte duro em hardCharLimit. Nunca lanca, nunca
// retorna string maior que hardCharLimit.
export function summarizeToBoundary(text, hardCharLimit) {
  if (text.length <= hardCharLimit) return text;

  let lastBoundary = -1;
  SENTENCE_BOUNDARY_RE.lastIndex = 0;
  let match;
  while ((match = SENTENCE_BOUNDARY_RE.exec(text))) {
    const boundaryEnd = match.index + match[0].length;
    if (boundaryEnd > hardCharLimit) break;
    if (boundaryEnd >= MIN_SUMMARY_CHARS) lastBoundary = boundaryEnd;
  }

  if (lastBoundary > -1) {
    return text.slice(0, lastBoundary).trim();
  }
  return text.slice(0, hardCharLimit).trim();
}

export function validateLlmResponse(text, options = {}) {
  if (typeof text !== 'string') {
    return { valid: false, reason: 'not_string' };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, reason: 'empty' };
  }

  const hardCharLimit = Number.isFinite(options.maxChars) && options.maxChars > 0
    ? options.maxChars
    : MAX_RESPONSE_CHARS;

  const wasTruncated = trimmed.length > hardCharLimit;
  const finalText = wasTruncated ? summarizeToBoundary(trimmed, hardCharLimit) : trimmed;

  if (!finalText) {
    return { valid: false, reason: 'too_long' };
  }
  if (looksLikeStructuredFinancialAction(finalText)) {
    return { valid: false, reason: 'financial_action' };
  }
  return { valid: true, text: finalText, summarized: wasTruncated };
}
