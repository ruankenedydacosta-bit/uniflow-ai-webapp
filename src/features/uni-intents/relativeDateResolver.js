import { normalizeFinancialText } from './intentClassifier.js';

// BLOCO E: resolucao DETERMINISTICA de expressoes de data relativa em
// pt-BR. Usado tanto pelo parser determinístico (entityExtractor.js) quanto
// para VALIDAR (nunca confiar cegamente) a `resolved_date` que a camada
// neural (financial_plan) possa sugerir -- a IA pode interpretar a
// expressao, mas a data final sempre passa por aqui antes de ser aceita.

const WEEKDAY_NAMES = Object.freeze([
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado',
]);

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? null : date;
}

function shiftDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function lastDayOfMonth(date) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return next;
}

function firstDayOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

// Dia N do mes: regra deliberada (documentada) -- resolve para a
// ocorrencia mais recente que nao seja no futuro (o mes atual se o dia N
// ja passou ou e hoje; o mes anterior caso contrario). Expressoes como
// "dia 5" ditas ao registrar um gasto normalmente se referem a algo que ja
// aconteceu, nunca a uma data futura.
function resolveDayOfMonth(reference, day) {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const candidateThisMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), day));
  if (candidateThisMonth.getUTCMonth() !== reference.getUTCMonth()) return null; // dia invalido para o mes (ex.: 31 em fevereiro)
  if (candidateThisMonth.getTime() <= reference.getTime()) return candidateThisMonth;

  const previousMonth = reference.getUTCMonth() - 1;
  const candidatePreviousMonth = new Date(Date.UTC(reference.getUTCFullYear(), previousMonth, day));
  // Mesma validacao para o mes anterior -- se o dia nao existir nele (ex.:
  // "dia 31" com o mes anterior tendo so 30 dias), a expressao nao pode ser
  // resolvida com seguranca; nunca deixar o JS "rolar" para outro mes.
  const normalizedPreviousMonth = ((previousMonth % 12) + 12) % 12;
  if (candidatePreviousMonth.getUTCMonth() !== normalizedPreviousMonth) return null;
  return candidatePreviousMonth;
}

// Nome de dia da semana: "segunda" (bare) ou "segunda passada" -> ocorrencia
// passada mais recente (inclui hoje, se hoje for o proprio dia). "segunda
// que vem"/"proxima segunda" -> ocorrencia futura mais proxima.
function resolveWeekday(reference, weekdayIndex, direction) {
  const referenceWeekday = reference.getUTCDay();
  if (direction === 'next') {
    const diff = (weekdayIndex - referenceWeekday + 7) % 7 || 7;
    return shiftDays(reference, diff);
  }
  const diff = (referenceWeekday - weekdayIndex + 7) % 7;
  return shiftDays(reference, -diff);
}

/**
 * Resolve uma expressao de data relativa em pt-BR contra uma data de
 * referencia FIXA (nunca `new Date()` implicito -- sempre injetada, para
 * permitir testes com relogio fixo e para nunca depender do relogio real
 * do processo). Retorna { resolvedDate, ruleId } ou { resolvedDate: null,
 * ruleId: null } quando a expressao e desconhecida/ambigua demais para
 * resolver com seguranca.
 */
export function resolveRelativeDateExpression(expression, referenceDate) {
  if (typeof expression !== 'string') return { resolvedDate: null, ruleId: null };
  const text = normalizeFinancialText(expression);
  if (!text) return { resolvedDate: null, ruleId: null };

  // Data explicita (dd/mm/aaaa) nao depende de uma data de referencia --
  // resolvida independentemente, igual ao comportamento anterior.
  const explicitDate = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (explicitDate) {
    const [, day, month, year] = explicitDate;
    const candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return parseIsoDate(candidate)
      ? { resolvedDate: candidate, ruleId: 'explicit_date' }
      : { resolvedDate: null, ruleId: null };
  }

  const reference = parseIsoDate(referenceDate);
  if (!reference) return { resolvedDate: null, ruleId: null };

  if (/\bhoje\b/.test(text)) return { resolvedDate: toIsoDate(reference), ruleId: 'today' };
  if (/\banteontem\b/.test(text)) return { resolvedDate: toIsoDate(shiftDays(reference, -2)), ruleId: 'day_before_yesterday' };
  if (/\bontem\b/.test(text)) return { resolvedDate: toIsoDate(shiftDays(reference, -1)), ruleId: 'yesterday' };
  if (/\bamanha\b/.test(text)) return { resolvedDate: toIsoDate(shiftDays(reference, 1)), ruleId: 'tomorrow' };

  if (/\bfim\s+do\s+mes\b|\bfinal\s+do\s+mes\b/.test(text)) {
    return { resolvedDate: toIsoDate(lastDayOfMonth(reference)), ruleId: 'end_of_month' };
  }
  if (/\bcomeco\s+do\s+mes\b|\binicio\s+do\s+mes\b/.test(text)) {
    return { resolvedDate: toIsoDate(firstDayOfMonth(reference)), ruleId: 'start_of_month' };
  }

  if (/\bsemana\s+passada\b/.test(text)) {
    return { resolvedDate: toIsoDate(shiftDays(reference, -7)), ruleId: 'last_week' };
  }
  if (/\bsemana\s+que\s+vem\b|\bproxima\s+semana\b/.test(text)) {
    return { resolvedDate: toIsoDate(shiftDays(reference, 7)), ruleId: 'next_week' };
  }

  const dayOfMonthMatch = text.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOfMonthMatch) {
    const resolved = resolveDayOfMonth(reference, Number(dayOfMonthMatch[1]));
    if (resolved) return { resolvedDate: toIsoDate(resolved), ruleId: 'day_of_month' };
    return { resolvedDate: null, ruleId: null };
  }

  const weekdayIndex = WEEKDAY_NAMES.findIndex((name) => new RegExp(`\\b${name}(?:-feira)?\\b`).test(text));
  if (weekdayIndex >= 0) {
    const direction = /\bque\s+vem\b|\bproxim[ao]\b/.test(text) ? 'next' : 'previous';
    const resolved = resolveWeekday(reference, weekdayIndex, direction);
    return { resolvedDate: toIsoDate(resolved), ruleId: `weekday_${direction}` };
  }

  return { resolvedDate: null, ruleId: null };
}

export function isValidIsoDate(value) {
  return parseIsoDate(value) !== null;
}
