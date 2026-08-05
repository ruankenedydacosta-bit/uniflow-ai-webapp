// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Bloco 1:
// Resolvedor Temporal.
//
// resolveTemporalReferences(text, referenceDate) extrai e resolve referências
// temporais em linguagem natural para entidades estruturadas. Exemplos:
//   "este mês" → { type: 'current_month', start: '2026-08-01', end: '2026-08-31' }
//   "últimos 3 meses" → { type: 'last_n_months', n: 3, ... }
//   "janeiro de 2026" → { type: 'specific_month', year: 2026, month: 1 }
//   "desde 15/01/2026" → { type: 'since_date', date: '2026-01-15' }
//
// Regras: determinístico, sem LLM, sem rede, serializável, shadow-only.

import { TEMPORAL_ENTITY_TYPES, TEMPORAL_RESOLVER_STATUS, isTemporalEntityType } from '../types/index.js';
import { createEmptyFinancialConversationalStageResults } from '../contracts/index.js';

const MONTH_NAMES_PT = Object.freeze({
  janeiro: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, março: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9,
  out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
});

const RELATIVE_PATTERNS = Object.freeze([
  { regex: /^este\s+m[eê]s$/i, type: 'current_month' },
  { regex: /^m[eê]s\s+passado$/i, type: 'previous_month' },
  { regex: /^m[eê]s\s+que\s+vem$/i, type: 'next_month' },
  { regex: /^[uú]ltimos\s+(\d+)\s+meses?$/i, type: 'last_n_months', extract: (m) => ({ n: parseInt(m[1], 10) }) },
  { regex: /^(\d+)\s+meses?\s+atr[aá]s?$/i, type: 'last_n_months', extract: (m) => ({ n: parseInt(m[1], 10) }) },
  { regex: /^(\d+)\s+meses?\s+passados?$/i, type: 'last_n_months', extract: (m) => ({ n: parseInt(m[1], 10) }) },
  { regex: /^(\d+)\s+dias?\s+atr[aá]s?$/i, type: 'last_n_days', extract: (m) => ({ n: parseInt(m[1], 10) }) },
  { regex: /^(\d+)\s+anos?\s+atr[aá]s?$/i, type: 'last_n_months', extract: (m) => ({ n: parseInt(m[1], 10) * 12 }) },
  { regex: /^ano\s+passado$/i, type: 'last_n_months', extract: () => ({ n: 12 }) },
  { regex: /^este\s+ano$/i, type: 'year_to_date' },
  { regex: /^ano\s+atual$/i, type: 'year_to_date' },
  { regex: /^desde\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/i, type: 'since_date', extract: (m) => ({ date: `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` }) },
  { regex: /^desde\s+(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/i, type: 'since_date', extract: (m) => ({ date: `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` }) },
  { regex: /^at[eé]\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/i, type: 'until_date', extract: (m) => ({ date: `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` }) },
  { regex: /^at[eé]\s+(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/i, type: 'until_date', extract: (m) => ({ date: `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` }) },
]);

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:]/g, '')
    .trim();
}

function getMonthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${endDate}`;
  return { start, end };
}

function getCurrentMonthBounds(referenceDate) {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth() + 1;
  return getMonthBounds(year, month);
}

function getPreviousMonthBounds(referenceDate) {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  let year = ref.getFullYear();
  let month = ref.getMonth();
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return getMonthBounds(year, month);
}

function resolveRelativePattern(text, referenceDate) {
  for (const pattern of RELATIVE_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const base = { type: pattern.type, status: 'resolved', confidence: 0.95 };
      const extracted = pattern.extract ? pattern.extract(match) : {};
      const resolved = { ...base, ...extracted };

      if (resolved.type === 'current_month') {
        const bounds = getCurrentMonthBounds(referenceDate);
        resolved.start = bounds.start;
        resolved.end = bounds.end;
        resolved.granularity = 'month';
      } else if (resolved.type === 'previous_month') {
        const bounds = getPreviousMonthBounds(referenceDate);
        resolved.start = bounds.start;
        resolved.end = bounds.end;
        resolved.granularity = 'month';
      } else if (resolved.type === 'last_n_months') {
        const ref = referenceDate ? new Date(referenceDate) : new Date();
        const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
        const start = new Date(ref.getFullYear(), ref.getMonth() - (resolved.n - 1), 1);
        resolved.start = start.toISOString().slice(0, 10);
        resolved.end = end.toISOString().slice(0, 10);
        resolved.granularity = 'month';
      } else if (resolved.type === 'last_n_days') {
        const ref = referenceDate ? new Date(referenceDate) : new Date();
        const end = new Date(ref);
        const start = new Date(ref);
        start.setDate(start.getDate() - resolved.n + 1);
        resolved.start = start.toISOString().slice(0, 10);
        resolved.end = end.toISOString().slice(0, 10);
        resolved.granularity = 'day';
      } else if (resolved.type === 'year_to_date') {
        const ref = referenceDate ? new Date(referenceDate) : new Date();
        const year = ref.getFullYear();
        resolved.start = `${year}-01-01`;
        resolved.end = ref.toISOString().slice(0, 10);
        resolved.granularity = 'month';
      } else if (resolved.type === 'since_date' || resolved.type === 'until_date') {
        resolved.granularity = 'day';
      }
      return resolved;
    }
  }
  return null;
}

function resolveSpecificMonth(text, referenceDate) {
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const month = MONTH_NAMES_PT[words[i]];
    if (month) {
      let year = null;
      if (i + 1 < words.length && /^\d{4}$/.test(words[i + 1])) {
        year = parseInt(words[i + 1], 10);
      } else if (i > 0 && /^\d{4}$/.test(words[i - 1])) {
        year = parseInt(words[i - 1], 10);
      } else {
        const ref = referenceDate ? new Date(referenceDate) : new Date();
        year = ref.getFullYear();
        if (month > ref.getMonth() + 1) year -= 1;
      }
      if (year && year >= 2000 && year <= 2100) {
        const bounds = getMonthBounds(year, month);
        return {
          type: 'specific_month',
          status: 'resolved',
          confidence: 0.9,
          year,
          month,
          start: bounds.start,
          end: bounds.end,
          granularity: 'month',
        };
      }
    }
  }
  return null;
}

function resolveDateRange(text) {
  const rangeMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(?:a|ate|ate\s+|\-)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
  if (rangeMatch) {
    const start = `${rangeMatch[3]}-${rangeMatch[2].padStart(2,'0')}-${rangeMatch[1].padStart(2,'0')}`;
    const end = `${rangeMatch[6]}-${rangeMatch[5].padStart(2,'0')}-${rangeMatch[4].padStart(2,'0')}`;
    return {
      type: 'specific_date_range',
      status: 'resolved',
      confidence: 0.95,
      start,
      end,
      granularity: 'day',
    };
  }
  return null;
}

export function resolveTemporalReferences(text, referenceDate = null) {
  const safeText = normalizeText(text);
  if (!safeText) {
    return {
      status: 'out_of_scope',
      confidence: 0,
      resolved: null,
      originalText: text,
    };
  }

  const frozenStages = createEmptyFinancialConversationalStageResults();
  const stages = {};
  for (const key of Object.keys(frozenStages)) {
    stages[key] = { ...frozenStages[key] };
  }
  stages.temporal_resolution = { present: true, executed: true, status: 'ok', errorCode: null };

  let resolved = resolveRelativePattern(safeText, referenceDate);
  if (!resolved) resolved = resolveSpecificMonth(safeText, referenceDate);
  if (!resolved) resolved = resolveDateRange(safeText);

  if (!resolved) {
    return {
      status: 'ambiguous',
      confidence: 0.3,
      resolved: null,
      originalText: text,
      suggestions: ['tente "este mês", "mês passado", "últimos 3 meses", "janeiro 2026"'],
    };
  }

  if (!isTemporalEntityType(resolved.type)) {
    return {
      status: 'invalid_format',
      confidence: 0,
      resolved: null,
      originalText: text,
    };
  }

  return {
    status: 'resolved',
    confidence: resolved.confidence,
    resolved,
    originalText: text,
  };
}

const ENTITY_EXTRACTION_PATTERNS = Object.freeze([
  { regex: /este\s+m[eê]s/gi, type: 'current_month' },
  { regex: /m[eê]s\s+passado/gi, type: 'previous_month' },
  { regex: /m[eê]s\s+que\s+vem/gi, type: 'next_month' },
  { regex: /(\d+)\s+meses?\s+atr[aá]s?/gi, type: 'last_n_months', extract: (m) => ({ n: parseInt(m[1], 10) }) },
  { regex: /(\d+)\s+meses?\s+passados?/gi, type: 'last_n_months', extract: (m) => ({ n: parseInt(m[1], 10) }) },
  { regex: /(\d+)\s+dias?\s+atr[aá]s?/gi, type: 'last_n_days', extract: (m) => ({ n: parseInt(m[1], 10) }) },
  { regex: /(\d+)\s+anos?\s+atr[aá]s?/gi, type: 'last_n_months', extract: (m) => ({ n: parseInt(m[1], 10) * 12 }) },
  { regex: /ano\s+passado/gi, type: 'last_n_months', extract: () => ({ n: 12 }) },
  { regex: /este\s+ano/gi, type: 'year_to_date' },
  { regex: /ano\s+atual/gi, type: 'year_to_date' },
  { regex: /desde\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/gi, type: 'since_date', extract: (m) => ({ date: `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` }) },
  { regex: /desde\s+(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/gi, type: 'since_date', extract: (m) => ({ date: `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` }) },
  { regex: /at[eé]\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/gi, type: 'until_date', extract: (m) => ({ date: `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` }) },
  { regex: /at[eé]\s+(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/gi, type: 'until_date', extract: (m) => ({ date: `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` }) },
]);

export function extractTemporalEntities(text) {
  const safeText = normalizeText(text);
  const entities = [];
  for (const pattern of ENTITY_EXTRACTION_PATTERNS) {
    const regex = new RegExp(pattern.regex);
    let match;
    while ((match = regex.exec(safeText)) !== null) {
      const extracted = pattern.extract ? pattern.extract(match) : {};
      entities.push({
        type: pattern.type,
        text: match[0],
        index: match.index,
        ...extracted,
      });
    }
  }
  for (const [name, num] of Object.entries(MONTH_NAMES_PT)) {
    const regex = new RegExp(`\\b${name}\\b`, 'gi');
    let match;
    while ((match = regex.exec(safeText)) !== null) {
      entities.push({
        type: 'month_reference',
        text: match[0],
        index: match.index,
        month: num,
      });
    }
  }
  return entities;
}

export function buildTemporalContext(resolvedTemporal, snapshot) {
  if (!resolvedTemporal?.resolved) return null;
  const { resolved } = resolvedTemporal;
  const context = {
    period: resolved,
    referenceDate: snapshot?.referenceDate ?? new Date().toISOString().slice(0, 10),
    currentMonth: snapshot?.currentMonth ?? null,
    previousMonth: snapshot?.previousMonth ?? null,
    hasData: snapshot?.hasData ?? false,
  };
  if (resolved.type === 'current_month') {
    context.periodLabel = 'mês corrente';
    context.periodKey = snapshot?.currentMonth;
    context.isCurrentPeriod = true;
    context.isPreviousPeriod = false;
    context.isHistorical = false;
  } else if (resolved.type === 'previous_month') {
    context.periodLabel = 'mês anterior';
    context.periodKey = snapshot?.previousMonth;
    context.isCurrentPeriod = false;
    context.isPreviousPeriod = true;
    context.isHistorical = false;
  } else if (resolved.type === 'last_n_months') {
    context.periodLabel = `últimos ${resolved.n} meses`;
    context.isCurrentPeriod = false;
    context.isPreviousPeriod = false;
    context.isHistorical = true;
  } else if (resolved.type === 'specific_month') {
    context.periodLabel = `${resolved.month}/${resolved.year}`;
    context.periodKey = `${resolved.year}-${String(resolved.month).padStart(2,'0')}`;
    context.isCurrentPeriod = false;
    context.isPreviousPeriod = false;
    context.isHistorical = true;
  }
  return context;
}