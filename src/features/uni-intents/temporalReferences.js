// Resolvedor de referências temporais que ocupam a frase inteira ("3 meses
// atrás", "ano atual", "fev"). Reserva do temporalExpressionResolver para o
// que ele não cobre. Veio do uni-engine (Fase 16), sem mudança de resultado.
//
// resolveTemporalReferences(text, referenceDate) devolve
// { status, confidence, resolved, originalText }. Exemplos:
//   "este mês" → { type: 'current_month', start: '2026-08-01', end: '2026-08-31' }
//   "últimos 3 meses" → { type: 'last_n_months', n: 3, ... }
//   "janeiro de 2026" → { type: 'specific_month', year: 2026, month: 1 }
//   "desde 15/01/2026" → { type: 'since_date', date: '2026-01-15' }

// Tipos aceitos. 'next_month' fica de fora de propósito: o padrão existe,
// mas o resultado é descartado como invalid_format.
const TEMPORAL_ENTITY_TYPES = new Set([
  'current_month',
  'previous_month',
  'last_n_months',
  'year_to_date',
  'last_n_days',
  'specific_month',
  'specific_date_range',
  'since_date',
  'until_date',
]);

const MONTH_NAMES_PT = Object.freeze({
  janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, março: 3,
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
  { regex: /^desde\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/i, type: 'since_date', extract: (m) => ({ date: `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` }) },
  { regex: /^desde\s+(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/i, type: 'since_date', extract: (m) => ({ date: `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` }) },
  { regex: /^at[eé]\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/i, type: 'until_date', extract: (m) => ({ date: `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` }) },
  { regex: /^at[eé]\s+(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/i, type: 'until_date', extract: (m) => ({ date: `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` }) },
]);

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:]/g, '')
    .trim();
}

// BUG REAL (Sprint 3, corrigido na origem): este arquivo construía a data
// de referência com `new Date(referenceDate)` (uma string 'YYYY-MM-DD' vira
// meia-noite UTC) e depois lia/escrevia com getters LOCAIS. Em qualquer
// fuso de offset negativo (ex.: America/Sao_Paulo, UTC-3) isso deslocava o
// resultado em 1 dia perto de virada de semana/mês/ano. Mesma correção já
// aplicada em temporalExpressionResolver.js -- toda a aritmética
// abaixo usa APENAS Date.UTC(...) e getters/setters UTC, nunca os dois
// misturados.
function parseReferenceDateUtc(referenceDate) {
  if (typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(referenceDate)) {
    const [year, month, day] = referenceDate.slice(0, 10).split('-').map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getMonthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`;
  return { start, end };
}

function getCurrentMonthBounds(referenceDate) {
  const ref = parseReferenceDateUtc(referenceDate);
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth() + 1;
  return getMonthBounds(year, month);
}

function getPreviousMonthBounds(referenceDate) {
  const ref = parseReferenceDateUtc(referenceDate);
  let year = ref.getUTCFullYear();
  let month = ref.getUTCMonth();
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
        const ref = parseReferenceDateUtc(referenceDate);
        const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
        const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (resolved.n - 1), 1));
        resolved.start = start.toISOString().slice(0, 10);
        resolved.end = end.toISOString().slice(0, 10);
        resolved.granularity = 'month';
      } else if (resolved.type === 'last_n_days') {
        const ref = parseReferenceDateUtc(referenceDate);
        const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - resolved.n + 1));
        resolved.start = start.toISOString().slice(0, 10);
        resolved.end = ref.toISOString().slice(0, 10);
        resolved.granularity = 'day';
      } else if (resolved.type === 'year_to_date') {
        const ref = parseReferenceDateUtc(referenceDate);
        const year = ref.getUTCFullYear();
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
      let year;
      if (i + 1 < words.length && /^\d{4}$/.test(words[i + 1])) {
        year = parseInt(words[i + 1], 10);
      } else if (i > 0 && /^\d{4}$/.test(words[i - 1])) {
        year = parseInt(words[i - 1], 10);
      } else {
        const ref = parseReferenceDateUtc(referenceDate);
        year = ref.getUTCFullYear();
        if (month > ref.getUTCMonth() + 1) year -= 1;
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
  const rangeMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*(?:a|ate|ate\s+|-)\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i);
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

  if (!TEMPORAL_ENTITY_TYPES.has(resolved.type)) {
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
