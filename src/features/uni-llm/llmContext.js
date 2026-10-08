// Montagem do contexto minimo, sanitizado e truncado enviado ao LLM.
import { buildPersonalityInstructions } from '../uni-personality/index.js';
import { buildContextGuidanceLines } from '../uni-chat/uniContextCopy.js';
import { buildOpenAiToolsSchema } from '../uni-engine/tool-calling/financial-tools/index.js';
import {
  buildConversationStyleInstructions,
  resolveConversationStyle,
  resolveConversationStyleTokenBudget,
} from './conversationStyle.js';
import { isLlmToolsFlagEnabled } from './llmConfig.js';

export const MAX_HISTORY_MESSAGES = 8;
export const MAX_MESSAGE_CHARS = 500;
export const MAX_SYSTEM_CHARS = 4000;

const SENSITIVE_PATTERNS = [
  { re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, tag: '[dado removido]' },
  { re: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, tag: '[dado removido]' },
  { re: /\b(?:\d[ -]?){13,19}\b/g, tag: '[dado removido]' },
  { re: /\b(?:sk|pk)[-_][A-Za-z0-9]{16,}\b/g, tag: '[dado removido]' },
  { re: /\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi, tag: '[dado removido]' },
  { re: /\b(senha|password|token|api[_-]?key|secret|chave\s+privada)\b\s*[:=]\s*\S+/gi, tag: '$1: [removido]' },
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, tag: '[email removido]' },
];

export function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  let out = value;
  for (const { re, tag } of SENSITIVE_PATTERNS) {
    out = out.replace(re, tag);
  }
  return out
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

export function buildSanitizedFinancialSummary(financialContext = {}, mode = 'pessoal') {
  if (!financialContext || financialContext.hasData !== true) {
    return { hasData: false, mode };
  }
  const round = (n) => Math.round(Number(n || 0) * 100) / 100;
  const summary = {
    hasData: true,
    mode,
    monthlyIncome: round(financialContext.monthlyIncome),
    monthlyExpense: round(financialContext.monthlyExpense),
    monthlyIncomeCount: Number(financialContext.monthlyIncomeCount ?? 0),
    monthlyExpenseCount: Number(financialContext.monthlyExpenseCount ?? 0),
  };
  if (financialContext.topCategory?.name) {
    summary.topExpenseCategory = {
      name: sanitizeText(financialContext.topCategory.name),
      amount: round(financialContext.topCategory.amount),
    };
  }
  return summary;
}

export function buildSanitizedHistory(messages = [], limit = MAX_HISTORY_MESSAGES) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .filter((m) => m.type !== 'confirmation')
    .slice(-limit)
    .map((m) => ({
      role: m.from === 'user' ? 'user' : 'assistant',
      content: sanitizeText(m.text),
    }))
    .filter((m) => m.content);
}

export function buildSystemPrompt({
  personalityProfileId, workspaceType, financialSummary, conversationStyle, referenceDate,
} = {}) {
  const personality = buildPersonalityInstructions({
    preferredProfile: personalityProfileId,
    context: { workspaceType },
  });
  // BLOCO A1: eixo de extensao (simples/normal/detalhado), ortogonal ao tom
  // de personalidade acima -- ver conversationStyle.js. Sempre resolve para
  // um valor valido (default 'simple') mesmo se conversationStyle vier
  // ausente/invalido.
  const styleInstructions = buildConversationStyleInstructions(conversationStyle);

  const guardrails = [
    '',
    styleInstructions,
    '',
    'REGRAS DE ATUACAO NO CHAT FINANCEIRO DA UNI:',
    '- Responda sempre em portugues do Brasil (PT-BR).',
    '- Seja clara, acolhedora e objetiva. Nunca julgue o usuario.',
    '- Distinga explicitamente fatos, estimativas e sugestoes.',
    '- Use APENAS os dados disponiveis no contexto abaixo. Nunca invente numeros ou transacoes.',
    '- Saldo nao e um conceito publico da UniFlow. Nunca informe saldo atual, saldo total,',
    '  initial balance, current balance, valor restante, patrimonio disponivel ou quanto sobrou.',
    '- Nunca subtraia Entradas e Saidas para narrar resultado positivo/negativo.',
    '- Em resumos financeiros, informe somente quantidade e total de Entradas e de Saidas.',
    '- Se um dado nao estiver no contexto, admita que nao sabe e oriente como obte-lo no app.',
    '- Nao garanta aconselhamento financeiro profissional; ofereca caminhos, nao decisoes.',
    `- Respeite o contexto ativo do workspace: ${workspaceType === 'business' ? 'PJ / Empresa' : 'PF / Pessoal'}.`,
    ...buildContextGuidanceLines(workspaceType),
    '- Voce NAO pode criar, alterar ou excluir transacoes/contas. Movimentacoes financeiras',
    '  passam obrigatoriamente pelo fluxo de confirmacao do proprio app. No maximo sugira;',
    '  nunca emita comandos, JSON de acao ou instrucoes estruturadas de mutacao financeira.',
    '- Se pedirem para alterar um lancamento ja registrado, oriente a pedir com o nome, o dia',
    '  e a mudanca, por exemplo: "corrige o mercado de ontem para 50".',
    '',
    'PERSONALIDADE:',
    '- Voce e a Uni, uma consultora financeira acessivel -- nunca se apresente como',
    '  chatbot, assistente virtual, IA ou robo. Converse como uma pessoa que entende',
    '  de dinheiro e quer genuinamente ajudar, nunca como um menu ou um fluxo.',
    '',
    'LINGUAGEM:',
    '- Evite jargao financeiro sem necessidade. Se um termo tecnico (categoria,',
    '  conciliacao, etc.) puder confundir, explique em uma frase simples e',
    '  com um exemplo concreto antes ou junto da pergunta.',
    '  Exemplo: "categoria e so o tipo do gasto -- mercado, combustivel, farmacia".',
    '',
    'CONVERSACAO E VARIACAO:',
    '- Varie a frase mesmo quando a intencao se repete (ex.: pedir a mesma',
    '  informacao faltante em turnos diferentes). Nunca repita literalmente a',
    '  mesma frase duas vezes na mesma conversa quando puder dizer de outro jeito.',
    '- Nunca liste opcoes como um menu numerado nem soe como um fluxo programado.',
    '',
    'ACOLHIMENTO:',
    '- Se o texto do usuario sinalizar preocupacao, ansiedade, medo ou frustracao',
    '  (financeira ou nao), acolha PRIMEIRO com uma frase curta e genuina, e so',
    '  depois traga a resposta/pergunta financeira. Nunca ignore a emocao para ir',
    '  direto ao dado.',
  ];

  const contextLines = ['', 'CONTEXTO FINANCEIRO DISPONIVEL (agregado):'];
  // Sprint 2 (Interpretação Temporal): linha puramente aditiva -- ajuda a
  // LLM a resolver expressoes temporais ("mes passado", "essa semana") no
  // caminho de fallback (quando o motor deterministico nao reconhece a
  // consulta), sem criar novo modo nem tocar a Edge Function.
  if (typeof referenceDate === 'string' && referenceDate) {
    contextLines.push(`- Data de referencia de hoje: ${referenceDate}.`);
  }
  if (financialSummary?.hasData) {
    contextLines.push(`- Perfil ativo: ${financialSummary.mode}`);
    contextLines.push(`- Entradas do mes: ${financialSummary.monthlyIncomeCount} registros, total R$ ${financialSummary.monthlyIncome}`);
    contextLines.push(`- Saidas do mes: ${financialSummary.monthlyExpenseCount} registros, total R$ ${financialSummary.monthlyExpense}`);
    if (financialSummary.topExpenseCategory) {
      contextLines.push(
        `- Maior categoria de despesa: ${financialSummary.topExpenseCategory.name} (R$ ${financialSummary.topExpenseCategory.amount})`,
      );
    }
  } else {
    contextLines.push('- Nenhum dado financeiro agregado disponivel no momento.');
  }

  const full = [personality, ...guardrails, ...contextLines].join('\n');
  return full.slice(0, MAX_SYSTEM_CHARS);
}

export function buildLlmPayload({
  text,
  messages,
  financialContext,
  mode,
  personalityProfileId,
  workspaceType,
  conversationStyle,
  referenceDate,
} = {}) {
  const financialSummary = buildSanitizedFinancialSummary(financialContext, mode);
  const safeStyle = resolveConversationStyle(conversationStyle);
  const system = buildSystemPrompt({
    personalityProfileId,
    workspaceType,
    financialSummary,
    conversationStyle: safeStyle,
    referenceDate: referenceDate ?? financialContext?.snapshot?.referenceDate ?? null,
  });
  const history = buildSanitizedHistory(messages);
  const userText = sanitizeText(text);

  return {
    system,
    messages: [...history, { role: 'user', content: userText }].filter((m) => m.content),
    // Sprint 1 (IA Conversacional): só inclui `tools` com a flag explícita
    // ligada (default desligada) -- sem ela, `tools` fica `undefined` e o
    // payload é byte-a-byte igual ao de antes desta sprint. As definições
    // vêm de FINANCIAL_READ_TOOL_META (Fase 20.2, único ponto de verdade),
    // nunca duplicadas aqui.
    tools: isLlmToolsFlagEnabled() ? buildOpenAiToolsSchema() : undefined,
    // BLOCO A1: conversationStyle e o orcamento de tokens correspondente vao
    // no meta -- o orquestrador repassa maxOutputTokens ao provider/Edge
    // Function; nunca confiavel cegamente no servidor (que sempre clampa).
    meta: {
      mode,
      workspaceType,
      personalityProfileId,
      conversationStyle: safeStyle,
      maxOutputTokens: resolveConversationStyleTokenBudget(safeStyle),
    },
  };
}
