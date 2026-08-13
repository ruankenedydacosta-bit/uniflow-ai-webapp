import { resolveTemporalRange } from '../uni-intents/temporalRangeResolver.js';
import {
  aggregateFinancialRange,
  normalizeFinancialText,
  roundMoney,
} from './financialSnapshot.js';

export const PUBLIC_BALANCE_RETIREMENT_TEXT =
  'A UniFlow agora organiza suas movimentações por Entradas e Saídas. Posso mostrar quanto entrou ou quanto saiu.';

const PUBLIC_BALANCE_QUERY_PATTERNS = Object.freeze([
  /\bsaldo\b/u,
  /\bquanto\s+(?:dinheiro\s+)?(?:eu\s+)?tenho\b/u,
  /\bquanto\s+tenho\s+(?:no|na|em)\b/u,
  /\bquanto\s+(?:tem|ha|ta|esta)\s+(?:no|na|em|nos|nas)\b/u,
  /\bquanto\s+(?:me\s+)?sobrou\b/u,
  /\bquanto\s+(?:ainda\s+)?restou\b/u,
  /\b(?:dinheiro|valor)\s+(?:disponivel|restante)\b/u,
]);

const PUBLIC_FINANCIAL_SUMMARY_PATTERNS = Object.freeze([
  /\b(?:me\s+)?(?:fala|fale|falar|conte|contar|diz|diga)\b[\s\S]*\b(?:meu\s+dinheiro|minhas\s+financas)\b/u,
  /\bcomo\s+(?:estao|anda|andam)\s+(?:as\s+)?minhas?\s+financas\b/u,
  /\bcomo\s+(?:estao|andam)\s+minhas?\s+movimentacoes\b/u,
  /\bcomo\s+(?:estou|estamos)\s+financeiramente\b/u,
  /\b(?:faz|faca|quero|mostra|mostre)\b[\s\S]*\bresumo\s+financeiro\b/u,
  /\bresumo\s+(?:das\s+)?(?:minhas\s+)?(?:financas|movimentacoes)\b/u,
  /\bcomo\s+foi\s+(?:o\s+)?meu\s+(?:mes|dia|ano)\b/u,
  /\bquanto\s+entrou\b[\s\S]*\bquanto\s+saiu\b/u,
]);

const FORBIDDEN_PUBLIC_BALANCE_NARRATIVE_PATTERNS = Object.freeze([
  /\bsaldo\s+atual\b/u,
  /\bseu\s+saldo\b/u,
  /\bsaldo\s+total\b/u,
  /\bresultado\s+(?:positivo|negativo)\b/u,
  /\b(?:voce|voces)\s+(?:esta|estao)\b[\s\S]*\b(?:no\s+positivo|no\s+negativo)\b/u,
  /\bpatrimonio\s+disponivel\b/u,
  /\bvalor\s+restante\b/u,
  /\bavailable\s+balance\b/u,
  /\bremaining\s+balance\b/u,
  /\b(?:sobrou|sobraram|restou|restaram|ficou|ficaram)\b[\s\S]{0,20}r\$\s*[\d.,]+/u,
  /\bvoce\s+(?:tem|possui)\s+r\$\s*[\d.,]+/u,
  /\bvoce\s+esta\s+com\s+r\$\s*[\d.,]+/u,
  /\b(?:diferenca|valor\s+liquido|fluxo\s+liquido)\b[\s\S]{0,30}r\$\s*[\d.,]+/u,
  /\bpatrimonio\b[\s\S]{0,30}r\$\s*[\d.,]+/u,
  /\b(?:dinheiro|valor)\s+(?:disponivel|restante)\b[\s\S]{0,20}r\$\s*[\d.,]+/u,
  /\bsaldo\b[\s\S]{0,30}r\$\s*[\d.,]+/u,
  /\bresultado(?:\s+do\s+mes)?\b[\s\S]{0,30}r\$\s*[\d.,]+/u,
]);

const RETIRED_PUBLIC_BALANCE_INTENTS = new Set([
  'check_balance',
  'set_balance',
  'ambiguous_balance_or_income',
]);

const PRESERVED_FUNCTIONAL_INTENTS = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
]);

/**
 * Porta pública de compatibilidade: mantém intents/serviços internos, mas
 * impede que consultas ou ajustes de Saldo cheguem aos executores públicos.
 */
export function isRetiredPublicBalanceRequest(text, intent) {
  if (typeof intent === 'string' && intent.startsWith('agenda_')) return false;
  if (PRESERVED_FUNCTIONAL_INTENTS.has(intent)) return false;
  if (RETIRED_PUBLIC_BALANCE_INTENTS.has(intent)) return true;
  const normalized = normalizeFinancialText(text);
  return PUBLIC_BALANCE_QUERY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isPublicFinancialSummaryRequest(text) {
  const normalized = normalizeFinancialText(text);
  if (!normalized) return false;
  return PUBLIC_FINANCIAL_SUMMARY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function containsForbiddenPublicBalanceNarrative(text) {
  const normalized = normalizeFinancialText(text);
  if (!normalized) return false;
  return FORBIDDEN_PUBLIC_BALANCE_NARRATIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isPublicFinancialRequest(text) {
  const normalized = normalizeFinancialText(text);
  if (!normalized) return false;
  if (/\b(?:agenda|agende|agendar|marca|marcar|reuniao|compromisso|consulta)\b/u.test(normalized)) {
    return false;
  }
  return isRetiredPublicBalanceRequest(text)
    || isPublicFinancialSummaryRequest(text)
    || /\b(?:dinheiro|financas|financeiro|entrada|entradas|saida|saidas|receita|receitas|despesa|despesas|gasto|gastos|saldo|conta|contas)\b/u.test(normalized);
}

function currentMonthRange(snapshot) {
  const reference = /^\d{4}-\d{2}-\d{2}$/.test(snapshot?.referenceDate ?? '')
    ? snapshot.referenceDate
    : new Date().toLocaleDateString('en-CA');
  const monthKey = snapshot?.currentMonth ?? reference.slice(0, 7);
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
    label: 'este mês',
  };
}

export function resolvePublicFinancialPeriod(snapshot, text) {
  const requested = resolveTemporalRange(text, snapshot?.referenceDate ?? null);
  if (requested.status === 'resolved') {
    return { start: requested.start, end: requested.end, label: requested.label };
  }
  return currentMonthRange(snapshot);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(roundMoney(value));
}

function periodLead(label) {
  const normalized = normalizeFinancialText(label);
  if (normalized === 'este mes') return 'Neste mês';
  if (normalized === 'mes passado') return 'No mês passado';
  if (normalized === 'esta semana') return 'Nesta semana';
  if (normalized === 'hoje') return 'Hoje';
  if (normalized === 'ontem') return 'Ontem';
  if (/^ultimos?\b/u.test(normalized)) return `Nos ${label}`;
  return `Em ${label}`;
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Única projeção pública para perguntas financeiras amplas ou aliases
 * históricos de saldo. O payload intencionalmente não contém saldo,
 * resultado nem qualquer subtração entre Entradas e Saídas.
 */
export function buildPublicMovementSummaryResponse({
  snapshot,
  text = '',
  range = null,
  includeRetirementIntro = false,
} = {}) {
  const resolvedRange = range ?? resolvePublicFinancialPeriod(snapshot, text);
  const aggregate = aggregateFinancialRange(snapshot, resolvedRange);
  return formatPublicMovementSummaryResponse({
    range: resolvedRange,
    income: aggregate.income,
    expenses: aggregate.expense,
    incomeCount: aggregate.incomeCount,
    expenseCount: aggregate.expenseCount,
    includeRetirementIntro,
  });
}

export function formatPublicMovementSummaryResponse({
  range,
  income = 0,
  expenses = 0,
  incomeCount = 0,
  expenseCount = 0,
  includeRetirementIntro = false,
} = {}) {
  const resolvedRange = range ?? { start: null, end: null, label: 'este mês' };
  const lead = periodLead(resolvedRange.label);
  let summary;

  if (incomeCount === 0 && expenseCount === 0) {
    summary = `${lead}, você ainda não registrou entradas nem saídas.`;
  } else {
    summary = `${lead}: ${pluralize(incomeCount, 'entrada', 'entradas')} — ${formatCurrency(income)}. `
      + `${pluralize(expenseCount, 'saída', 'saídas')} — ${formatCurrency(expenses)}.`;
  }

  const intro = includeRetirementIntro
    ? 'A UniFlow agora organiza suas finanças por Entradas e Saídas. '
    : '';

  return {
    text: `${intro}${summary}`,
    highlight: null,
    data: {
      period: resolvedRange,
      income: roundMoney(income),
      expenses: roundMoney(expenses),
      incomeCount,
      expenseCount,
    },
  };
}

/**
 * Barreira final contra regressões em narradores legados/LLM. Só substitui
 * texto quando a pergunta é financeira e a saída contém uma narrativa de
 * saldo proibida; código e cálculos internos permanecem intactos.
 */
export function enforcePublicFinancialResponsePolicy({ text, requestText, snapshot } = {}) {
  if (!containsForbiddenPublicBalanceNarrative(text)) return text;
  if (!isPublicFinancialRequest(requestText)) return text;
  return buildPublicMovementSummaryResponse({
    snapshot,
    text: requestText,
    includeRetirementIntro: isRetiredPublicBalanceRequest(requestText),
  }).text;
}
