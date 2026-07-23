// Montagem do contexto minimo, sanitizado e truncado enviado ao LLM.
import { buildPersonalityInstructions } from '../uni-personality/index.js';
import { buildContextGuidanceLines } from '../uni-chat/uniContextCopy.js';

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
    balance: round(financialContext.balance),
    monthlyIncome: round(financialContext.monthlyIncome),
    monthlyExpense: round(financialContext.monthlyExpense),
    monthlyResult: round(financialContext.result),
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

export function buildSystemPrompt({ personalityProfileId, workspaceType, financialSummary } = {}) {
  const personality = buildPersonalityInstructions({
    preferredProfile: personalityProfileId,
    context: { workspaceType },
  });

  const guardrails = [
    '',
    'REGRAS DE ATUACAO NO CHAT FINANCEIRO DA UNI:',
    '- Responda sempre em portugues do Brasil (PT-BR).',
    '- Seja clara, acolhedora e objetiva. Nunca julgue o usuario.',
    '- Distinga explicitamente fatos, estimativas e sugestoes.',
    '- Use APENAS os dados disponiveis no contexto abaixo. Nunca invente numeros, saldos ou transacoes.',
    '- Se um dado nao estiver no contexto, admita que nao sabe e oriente como obte-lo no app.',
    '- Nao garanta aconselhamento financeiro profissional; ofereca caminhos, nao decisoes.',
    `- Respeite o contexto ativo do workspace: ${workspaceType === 'business' ? 'PJ / Empresa' : 'PF / Pessoal'}.`,
    ...buildContextGuidanceLines(workspaceType),
    '- Voce NAO pode criar, alterar ou excluir transacoes/contas. Movimentacoes financeiras',
    '  passam obrigatoriamente pelo fluxo de confirmacao do proprio app. No maximo sugira;',
    '  nunca emita comandos, JSON de acao ou instrucoes estruturadas de mutacao financeira.',
  ];

  const contextLines = ['', 'CONTEXTO FINANCEIRO DISPONIVEL (agregado):'];
  if (financialSummary?.hasData) {
    contextLines.push(`- Perfil ativo: ${financialSummary.mode}`);
    contextLines.push(`- Saldo atual: R$ ${financialSummary.balance}`);
    contextLines.push(`- Receitas do mes: R$ ${financialSummary.monthlyIncome}`);
    contextLines.push(`- Despesas do mes: R$ ${financialSummary.monthlyExpense}`);
    contextLines.push(`- Resultado do mes: R$ ${financialSummary.monthlyResult}`);
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
} = {}) {
  const financialSummary = buildSanitizedFinancialSummary(financialContext, mode);
  const system = buildSystemPrompt({ personalityProfileId, workspaceType, financialSummary });
  const history = buildSanitizedHistory(messages);
  const userText = sanitizeText(text);

  return {
    system,
    messages: [...history, { role: 'user', content: userText }].filter((m) => m.content),
    meta: { mode, workspaceType, personalityProfileId },
  };
}
