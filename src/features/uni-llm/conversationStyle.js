// BLOCO A1: eixo de extensao de resposta da Uni -- simples / normal /
// detalhado. Ortogonal ao sistema de personalidade existente (uni-personality,
// eixo de TOM: balanced/direct/warm/strategic) -- este eixo controla apenas
// EXTENSAO/DETALHE, nunca tom ou vocabulario.
//
// A2: o valor persistido vive em profiles.conversation_style. Esta camada
// continua pura e tolerante: ambientes ainda sem a migration, valores
// ausentes ou inválidos sempre resolvem para `simple`.

export const CONVERSATION_STYLES = Object.freeze(['simple', 'normal', 'detailed']);
export const DEFAULT_CONVERSATION_STYLE = 'simple';

export function isValidConversationStyle(style) {
  return CONVERSATION_STYLES.includes(style);
}

export function resolveConversationStyle(style) {
  return isValidConversationStyle(style) ? style : DEFAULT_CONVERSATION_STYLE;
}

// Instrucao curta e objetiva injetada no prompt do LLM livre (handleUnresolvedMessage).
// Nao reescreve o sistema de personalidade -- soma-se a ele como uma regra
// adicional de extensao, que a auditoria (Bloco A1, item 4) apontou como o
// pedaco que faltava.
const STYLE_PROMPT_INSTRUCTIONS = Object.freeze({
  simple: [
    'ESTILO DE RESPOSTA: explicações simples.',
    '- Responda em 1 a 3 frases curtas, sem preâmbulo.',
    '- Vá direto ao ponto essencial. Nunca liste mais de 2 itens.',
    '- Só aprofunde (números adicionais, percentuais, cenários) se o usuário pedir explicitamente.',
  ],
  normal: [
    'ESTILO DE RESPOSTA: conversa normal.',
    '- Responda com clareza, podendo adicionar uma frase curta de contexto além do essencial.',
    '- Evite listas longas; no máximo 3 a 4 itens quando fizer sentido.',
  ],
  detailed: [
    'ESTILO DE RESPOSTA: explicações detalhadas.',
    '- O usuário pediu (ou já está em modo detalhado): pode incluir análise, percentuais e próximos passos.',
    '- Ainda assim, seja organizada -- nunca encha a resposta com repetição ou rodeio.',
  ],
});

export function buildConversationStyleInstructions(style) {
  const safeStyle = resolveConversationStyle(style);
  return STYLE_PROMPT_INSTRUCTIONS[safeStyle].join('\n');
}

// Orcamento de tokens de saida do LLM livre, por estilo. A Edge Function
// (supabase/functions/uni-chat-llm) usa isso para substituir o
// MAX_OUTPUT_TOKENS fixo=500 -- clampado la mesmo (defesa em profundidade,
// nunca confia cegamente em valor vindo do cliente).
export const CONVERSATION_STYLE_TOKEN_BUDGET = Object.freeze({
  simple: 110,
  normal: 220,
  detailed: 420,
});

export function resolveConversationStyleTokenBudget(style) {
  const safeStyle = resolveConversationStyle(style);
  return CONVERSATION_STYLE_TOKEN_BUDGET[safeStyle];
}

// Orcamento de CARACTERES para o resumo/corte gracioso de respostas longas
// (llmResponseGuard.js) -- usado no cliente, antes mesmo de exibir a
// resposta. Mantido conservador (menor que o token budget em "caracteres
// equivalentes") para deixar folga ao corte por sentenca.
export const CONVERSATION_STYLE_CHAR_BUDGET = Object.freeze({
  simple: 220,
  normal: 420,
  detailed: 900,
});

export function resolveConversationStyleCharBudget(style) {
  const safeStyle = resolveConversationStyle(style);
  return CONVERSATION_STYLE_CHAR_BUDGET[safeStyle];
}
