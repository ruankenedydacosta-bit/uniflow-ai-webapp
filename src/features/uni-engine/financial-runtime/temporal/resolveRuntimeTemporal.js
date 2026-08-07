// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Bloco 4:
// Temporal Runtime.
//
// Resolvedor temporal expandido que suporta todas as expressões
// necessárias para o runtime financeiro.
//
// Suporta:
//   hoje, ontem
//   esta semana, semana passada
//   este mês, mês passado, mês que vem
//   julho, junho, janeiro 2025
//   2025, 2024
//   últimos 3 meses, últimos 7 dias
//   este ano, ano passado
//   15/07/2025
//   01/07 a 31/07
//
// Reutiliza e estende o resolveTemporalReferences da Fase 16.
//
// BUG REAL (Sprint 3, corrigido na origem): este arquivo construía a data
// de referência com `new Date(referenceDate)` (uma string 'YYYY-MM-DD' vira
// meia-noite UTC) e depois lia/escrevia com getters LOCAIS
// (getFullYear/getMonth/getDay/getDate/setDate/setMonth). Em qualquer fuso
// com offset negativo (ex.: America/Sao_Paulo, UTC-3), meia-noite UTC do
// dia D é ainda o dia D-1 no relógio local -- então "esta semana"/"mês
// passado"/etc podiam resolver com 1 dia de deslocamento, sobretudo perto
// da virada do dia, da semana, do mês ou do ano. Toda a aritmética abaixo
// agora usa APENAS Date.UTC(...) na construção e getters/setters UTC
// (getUTC*/setUTC*) -- nunca mistura os dois. Outros consumidores deste
// módulo (resolveRuntimeTemporal/extractRuntimeTemporalEntities) herdam a
// correção automaticamente, sem precisar de nenhuma mudança própria.

import { RUNTIME_TEMPORAL_ENTITIES, isRuntimeTemporalEntity } from '../types/index.js';
import { resolveTemporalReferences, extractTemporalEntities } from '../../financial-conversational/temporal/index.js';
import { deepFreeze } from '../utils/shared.js';

// A Fase 16 (resolveTemporalReferences/extractTemporalEntities) usa seu
// próprio vocabulário de tipos ('current_month', 'previous_month',
// 'year_to_date'), diferente do vocabulário RUNTIME_TEMPORAL_ENTITIES desta
// Fase ('this_month', 'last_month', 'this_year'). Esta tabela é o único
// ponto de tradução entre os dois -- reaproveita o resolvedor da Fase 16
// (nunca duplica a lógica de resolução) e apenas relabela o tipo de saída.
const PHASE16_TYPE_ALIASES = Object.freeze({
  current_month: 'this_month',
  previous_month: 'last_month',
  year_to_date: 'this_year',
});

const MONTH_NAMES = Object.freeze({
  janeiro: 1, fevereiro: 2, mar: 3, marco: 3, março: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9,
  out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
});

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Único ponto de construção da data de referência -- sempre meia-noite
// UTC, nunca `new Date(referenceDate)` interpretado depois com getters
// locais. Uma string 'YYYY-MM-DD' inválida ou ausente cai no "agora" real,
// também ancorado em UTC (Date.now() já é um instante absoluto; só as
// COMPONENTES de ano/mês/dia usadas daqui pra baixo precisam ser lidas via
// getUTC*, nunca via getFullYear/getMonth/getDate locais).
function parseReferenceDate(referenceDate) {
  if (typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(referenceDate)) {
    const [year, month, day] = referenceDate.slice(0, 10).split('-').map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDaysUtc(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function shiftMonthsUtc(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function getMonthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  // Dia 0 do mês seguinte, em UTC, é o último dia do mês pedido -- mesma
  // técnica de antes, só que ancorada em Date.UTC em vez do construtor
  // local `new Date(year, month, 0)`.
  const endDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`;
  return { start, end };
}

function resolveSpecificMonth(text, referenceDate) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/);
  const now = parseReferenceDate(referenceDate);

  for (let i = 0; i < words.length; i++) {
    const month = MONTH_NAMES[words[i]];
    if (month) {
      let year = now.getUTCFullYear();
      if (i + 1 < words.length && /^\d{4}$/.test(words[i + 1])) {
        year = parseInt(words[i + 1], 10);
      } else if (month > now.getUTCMonth() + 1) {
        year -= 1;
      }

      if (year >= 2000 && year <= 2100) {
        const bounds = getMonthBounds(year, month);
        return {
          entity: 'specific_month',
          period: 'specific_month',
          month,
          year,
          start: bounds.start,
          end: bounds.end,
          label: `${month}/${year}`,
        };
      }
    }
  }
  return null;
}

function resolveSpecificYear(text) {
  const normalized = normalizeText(text);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 2000 && year <= 2100) {
      return {
        entity: 'specific_year',
        period: 'specific_year',
        year,
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        label: String(year),
      };
    }
  }
  return null;
}

function startOfWeekUtc(date) {
  const day = date.getUTCDay();
  // Semana começa na segunda-feira (dia 1); domingo (0) volta 6 dias.
  const diff = day === 0 ? 6 : day - 1;
  return shiftDaysUtc(date, -diff);
}

function resolveRelativePeriod(text, referenceDate) {
  const normalized = normalizeText(text);
  const ref = parseReferenceDate(referenceDate);

  // "hoje", "ontem"
  if (/\bhoje\b/i.test(normalized)) {
    const iso = toIso(ref);
    return {
      entity: 'today', period: 'today', start: iso, end: iso, label: 'hoje',
    };
  }
  if (/\bontem\b/i.test(normalized)) {
    const iso = toIso(shiftDaysUtc(ref, -1));
    return {
      entity: 'yesterday', period: 'yesterday', start: iso, end: iso, label: 'ontem',
    };
  }

  // "esta semana", "semana passada"
  if (/\besta\s+semana\b/i.test(normalized)) {
    const start = startOfWeekUtc(ref);
    const end = shiftDaysUtc(start, 6);
    return {
      entity: 'this_week',
      period: 'this_week',
      start: toIso(start),
      end: toIso(end),
      label: 'esta semana',
    };
  }
  if (/\bsemana\s+passada\b/i.test(normalized)) {
    const start = shiftDaysUtc(startOfWeekUtc(ref), -7);
    const end = shiftDaysUtc(start, 6);
    return {
      entity: 'last_week',
      period: 'last_week',
      start: toIso(start),
      end: toIso(end),
      label: 'semana passada',
    };
  }

  // "este mês", "mês passado", "mês que vem"
  if (/\beste\s+m[eê]s\b/i.test(normalized)) {
    const bounds = getMonthBounds(ref.getUTCFullYear(), ref.getUTCMonth() + 1);
    return {
      entity: 'this_month', period: 'this_month', start: bounds.start, end: bounds.end, label: 'este mês',
    };
  }
  if (/\bm[eê]s\s+passado\b/i.test(normalized)) {
    let year = ref.getUTCFullYear();
    let month = ref.getUTCMonth(); // mês anterior (0-based já é o mês -1 em relação ao atual 1-based)
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    const bounds = getMonthBounds(year, month);
    return {
      entity: 'last_month', period: 'last_month', start: bounds.start, end: bounds.end, label: 'mês passado',
    };
  }
  if (/\bm[eê]s\s+que\s+vem\b/i.test(normalized)) {
    let year = ref.getUTCFullYear();
    let month = ref.getUTCMonth() + 2;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const bounds = getMonthBounds(year, month);
    return {
      entity: 'next_month', period: 'next_month', start: bounds.start, end: bounds.end, label: 'mês que vem',
    };
  }

  // "últimos N meses/dias"
  const lastMonthsMatch = normalized.match(/[uú]ltimos\s+(\d+)\s+m[eê]ses?/i);
  if (lastMonthsMatch) {
    const n = parseInt(lastMonthsMatch[1], 10);
    const shifted = shiftMonthsUtc(ref, -(n - 1));
    const start = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1));
    return {
      entity: 'last_n_months',
      period: 'last_n_months',
      n,
      start: toIso(start),
      end: toIso(ref),
      label: `últimos ${n} meses`,
    };
  }

  const lastDaysMatch = normalized.match(/[uú]ltimos\s+(\d+)\s+dias?/i);
  if (lastDaysMatch) {
    const n = parseInt(lastDaysMatch[1], 10);
    const start = shiftDaysUtc(ref, -(n - 1));
    return {
      entity: 'last_n_days',
      period: 'last_n_days',
      n,
      start: toIso(start),
      end: toIso(ref),
      label: `últimos ${n} dias`,
    };
  }

  // "este ano", "ano passado"
  if (/\beste\s+ano\b/i.test(normalized)) {
    const year = ref.getUTCFullYear();
    return {
      entity: 'this_year',
      period: 'this_year',
      year,
      start: `${year}-01-01`,
      end: toIso(ref),
      label: String(year),
    };
  }
  if (/\bano\s+passado\b/i.test(normalized)) {
    const year = ref.getUTCFullYear() - 1;
    return {
      entity: 'last_year',
      period: 'last_year',
      year,
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: String(year),
    };
  }

  return null;
}

function resolveDateRange(text, referenceDate) {
  const normalized = normalizeText(text);
  const ref = parseReferenceDate(referenceDate);

  // "DD/MM/AAAA a DD/MM/AAAA" (ano explícito nos dois lados)
  const rangeMatchWithYear = normalized.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*(?:a|at[eé]|[-–])\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i);
  if (rangeMatchWithYear) {
    const start = `${rangeMatchWithYear[3]}-${rangeMatchWithYear[2].padStart(2, '0')}-${rangeMatchWithYear[1].padStart(2, '0')}`;
    const end = `${rangeMatchWithYear[6]}-${rangeMatchWithYear[5].padStart(2, '0')}-${rangeMatchWithYear[4].padStart(2, '0')}`;
    return {
      entity: 'date_range',
      period: 'date_range',
      start,
      end,
      label: `${rangeMatchWithYear[1]}/${rangeMatchWithYear[2]}/${rangeMatchWithYear[3]} a ${rangeMatchWithYear[4]}/${rangeMatchWithYear[5]}/${rangeMatchWithYear[6]}`,
    };
  }

  // "DD/MM a DD/MM" (sem ano -- assume o ano de referenceDate/hoje)
  const rangeMatchNoYear = normalized.match(/\b(\d{1,2})[/-](\d{1,2})\s*(?:a|at[eé]|[-–])\s*(\d{1,2})[/-](\d{1,2})\b/i);
  if (rangeMatchNoYear) {
    const year = ref.getUTCFullYear();
    const start = `${year}-${rangeMatchNoYear[2].padStart(2, '0')}-${rangeMatchNoYear[1].padStart(2, '0')}`;
    const end = `${year}-${rangeMatchNoYear[4].padStart(2, '0')}-${rangeMatchNoYear[3].padStart(2, '0')}`;
    return {
      entity: 'date_range',
      period: 'date_range',
      start,
      end,
      label: `${rangeMatchNoYear[1]}/${rangeMatchNoYear[2]} a ${rangeMatchNoYear[3]}/${rangeMatchNoYear[4]}`,
    };
  }

  return null;
}

function resolveSpecificDate(text) {
  const normalized = normalizeText(text);
  const dateMatch = normalized.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dateMatch) {
    const date = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
    return {
      entity: 'specific_date',
      period: 'specific_date',
      date,
      label: `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`,
    };
  }
  return null;
}

export function resolveRuntimeTemporal(text, referenceDate = null) {
  if (!text || typeof text !== 'string') {
    return deepFreeze({
      entity: null,
      period: null,
      confidence: 0,
      originalText: text,
    });
  }

  // BLOCO B: precedência determinística e documentada -- sem ela, uma data
  // completa como "15/07/2026" era capturada pelo resolvedor de ano isolado
  // (que casa o "2026" embutido) antes de chegar ao resolvedor de data
  // específica. Ordem, da mais para a menos específica:
  //   1. intervalo explícito ("01/07 a 31/07") -- padrão mais restritivo,
  //      precisa vir antes da data única para não ser cortado no meio;
  //   2. data explícita completa ("15/07/2026");
  //   3. expressões relativas específicas (hoje, ontem, esta semana,
  //      semana passada, este mês, mês passado, últimos N dias/meses,
  //      este ano, ano passado) -- todas inequívocas quando presentes;
  //   4. mês nomeado + ano opcional ("julho 2026", "julho");
  //   5. ano isolado ("2025") -- o mais genérico, só resolve se nada mais
  //      específico casou antes (evita capturar o ano de dentro de uma
  //      data completa já tratada nos passos 1-2);
  //   6. fallback para o resolvedor da Fase 16 (expressões que este
  //      resolvedor não cobre, ex.: "desde"/"até").
  let resolved = resolveDateRange(text, referenceDate);
  if (resolved) return deepFreeze({ ...resolved, confidence: 0.95, originalText: text });

  resolved = resolveSpecificDate(text);
  if (resolved) return deepFreeze({ ...resolved, confidence: 0.9, originalText: text });

  resolved = resolveRelativePeriod(text, referenceDate);
  if (resolved) return deepFreeze({ ...resolved, confidence: 0.9, originalText: text });

  resolved = resolveSpecificMonth(text, referenceDate);
  if (resolved) return deepFreeze({ ...resolved, confidence: 0.95, originalText: text });

  resolved = resolveSpecificYear(text);
  if (resolved) return deepFreeze({ ...resolved, confidence: 0.95, originalText: text });

  // Fallback para o resolvedor da Fase 16
  const phase16Result = resolveTemporalReferences(text, referenceDate);
  if (phase16Result.resolved) {
    const runtimeType = PHASE16_TYPE_ALIASES[phase16Result.resolved.type] ?? phase16Result.resolved.type;
    return deepFreeze({
      entity: runtimeType,
      period: runtimeType,
      ...phase16Result.resolved,
      confidence: phase16Result.confidence,
      originalText: text,
    });
  }

  return deepFreeze({
    entity: null,
    period: null,
    confidence: 0,
    originalText: text,
    suggestions: [
      'tente "hoje", "este mês", "mês passado", "julho", "2025"',
      '"últimos 3 meses", "últimos 7 dias", "este ano"',
      '"15/07/2025", "01/07 a 31/07"',
    ],
  });
}

export function extractRuntimeTemporalEntities(text) {
  const phase16Entities = extractTemporalEntities(text);
  return phase16Entities.map(e => {
    const aliasedType = PHASE16_TYPE_ALIASES[e.type] ?? e.type;
    return {
      ...e,
      runtimeType: RUNTIME_TEMPORAL_ENTITIES.includes(aliasedType) ? aliasedType : 'unknown',
    };
  });
}

export function getSupportedTemporalEntities() {
  return [...RUNTIME_TEMPORAL_ENTITIES];
}

export function isValidTemporalEntity(type) {
  return isRuntimeTemporalEntity(type);
}
