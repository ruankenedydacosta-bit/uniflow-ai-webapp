// Sprint 2 — Interpretação Temporal.
//
// resolveTemporalRange(text, referenceDate) resolve expressões temporais em
// pt-BR (embutidas em uma frase inteira, ex.: "quanto gastei este mês") para
// um intervalo estruturado { start, end, label, granularity, monthKeys }.
//
// Nunca inventa: quando a expressão não é reconhecida, devolve
// { status: 'not_recognized' }.
//
// Reaproveita, sem alterar, os resolvedores puros já existentes:
//   - resolveRuntimeTemporal (Fase 17) já cobre, embutido em frase inteira
//     (regex não ancorada): hoje, ontem, esta semana, semana passada, este
//     mês, mês passado, mês que vem, últimos N meses/dias, este ano, ano
//     passado, mês nomeado + ano, ano isolado, intervalo dd/mm[/aaaa].
//   - resolveRelativeDateExpression (uni-intents, já em produção) cobre
//     anteontem/amanhã como ponto único -- aqui só embrulhamos como
//     intervalo de 1 dia.
// Nenhum dos dois arquivos originais é modificado; nenhum gate de shadow/
// rollout é tocado ou ligado.
import { resolveRuntimeTemporal } from '../uni-engine/financial-runtime/temporal/resolveRuntimeTemporal.js';
import { resolveRelativeDateExpression } from './relativeDateResolver.js';

const MONTH_NAMES_PT = Object.freeze({
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
});

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function todayIso(referenceDate) {
  if (typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(referenceDate)) {
    return referenceDate.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

// Lista de chaves 'YYYY-MM' cobertas pelo intervalo [start, end], inclusive.
function computeMonthKeys(start, end) {
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  const keys = [];
  let year = startYear;
  let month = startMonth;
  // Limite de segurança -- nunca deveria disparar em uso real (intervalos
  // vindos de expressões de linguagem natural são sempre curtos).
  let guard = 0;
  while ((year < endYear || (year === endYear && month <= endMonth)) && guard < 1200) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    guard += 1;
  }
  return keys;
}

function resolved({ start, end, label, granularity }) {
  return {
    status: 'resolved',
    start,
    end,
    label,
    granularity,
    monthKeys: computeMonthKeys(start, end),
  };
}

function shiftDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "esta semana" / "semana passada" -- calculado aqui (nunca delegado ao
// resolveRuntimeTemporal) porque aquele resolvedor usa `new Date(string)` +
// getters em fuso LOCAL para achar o início da semana; em qualquer fuso com
// offset negativo (ex.: America/Sao_Paulo) isso desloca o resultado em 1
// dia. Aritmética 100% em UTC aqui evita o problema, sem tocar no arquivo
// original (Fase 17, fora do escopo desta Sprint).
function resolveWeekRange(text, referenceDate) {
  const n = normalizeText(text);
  const isThisWeek = /\besta\s+semana\b/.test(n);
  const isLastWeek = /\bsemana\s+passada\b/.test(n);
  if (!isThisWeek && !isLastWeek) return null;

  const ref = todayIso(referenceDate);
  const refWeekday = new Date(`${ref}T00:00:00.000Z`).getUTCDay(); // 0=domingo
  const diffToMonday = refWeekday === 0 ? 6 : refWeekday - 1;
  let monday = shiftDaysIso(ref, -diffToMonday);
  if (isLastWeek) monday = shiftDaysIso(monday, -7);
  const sunday = shiftDaysIso(monday, 6);
  return resolved({
    start: monday,
    end: sunday,
    label: isThisWeek ? 'esta semana' : 'semana passada',
    granularity: 'day',
  });
}

// "anteontem" / "amanhã" -- únicos pontos-no-tempo que faltam no
// resolveRuntimeTemporal; embrulhados aqui como intervalo de 1 dia.
function resolveSingleDayExtras(text, referenceDate) {
  const { resolvedDate, ruleId } = resolveRelativeDateExpression(text, todayIso(referenceDate));
  if (!resolvedDate) return null;
  if (ruleId === 'day_before_yesterday') {
    return resolved({ start: resolvedDate, end: resolvedDate, label: 'anteontem', granularity: 'day' });
  }
  if (ruleId === 'tomorrow') {
    return resolved({ start: resolvedDate, end: resolvedDate, label: 'amanhã', granularity: 'day' });
  }
  return null;
}

// "entre março e maio" / "entre março de 2025 e maio de 2025" -- intervalo
// de meses nomeados. Sem ano explícito, assume o ano de referência para
// ambos; se o mês final for anterior ao inicial, assume o ano seguinte para
// o mês final (ex.: "entre novembro e janeiro").
function resolveNamedMonthRange(text, referenceDate) {
  const n = normalizeText(text);
  const match = n.match(
    /\bentre\s+([a-z]+)(?:\s+de\s+(\d{4}))?\s+e\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/,
  );
  if (!match) return null;
  const [, monthAName, yearAStr, monthBName, yearBStr] = match;
  const monthA = MONTH_NAMES_PT[monthAName];
  const monthB = MONTH_NAMES_PT[monthBName];
  if (!monthA || !monthB) return null;

  const ref = todayIso(referenceDate);
  const refYear = Number(ref.slice(0, 4));
  const yearA = yearAStr ? Number(yearAStr) : refYear;
  let yearB = yearBStr ? Number(yearBStr) : refYear;
  if (!yearBStr && !yearAStr && (yearB < yearA || (yearB === yearA && monthB < monthA))) {
    yearB += 1;
  }

  const boundsA = monthBounds(yearA, monthA);
  const boundsB = monthBounds(yearB, monthB);
  return resolved({
    start: boundsA.start,
    end: boundsB.end,
    label: `entre ${monthAName} e ${monthBName}`,
    granularity: 'month',
  });
}

// "primeiro semestre" / "segundo semestre" (com ano opcional).
function resolveSemester(text, referenceDate) {
  const n = normalizeText(text);
  const match = n.match(/\b(primeiro|segundo)\s+semestre(?:\s+de\s+(\d{4}))?\b/);
  if (!match) return null;
  const [, which, yearStr] = match;
  const ref = todayIso(referenceDate);
  const year = yearStr ? Number(yearStr) : Number(ref.slice(0, 4));
  const isFirst = which === 'primeiro';
  const boundsStart = monthBounds(year, isFirst ? 1 : 7);
  const boundsEnd = monthBounds(year, isFirst ? 6 : 12);
  return resolved({
    start: boundsStart.start,
    end: boundsEnd.end,
    label: `${which} semestre de ${year}`,
    granularity: 'month',
  });
}

// "desde <mês nomeado>" (ex.: "desde janeiro", "desde março de 2025") --
// numérico ("desde 15/01/2026") já é coberto pelo fallback (Fase 16/17).
function resolveSinceNamedMonth(text, referenceDate) {
  const n = normalizeText(text);
  const match = n.match(/\bdesde\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/);
  if (!match) return null;
  const [, monthName, yearStr] = match;
  const month = MONTH_NAMES_PT[monthName];
  if (!month) return null;

  const ref = todayIso(referenceDate);
  const year = yearStr ? Number(yearStr) : Number(ref.slice(0, 4));
  const bounds = monthBounds(year, month);
  return resolved({
    start: bounds.start,
    end: ref,
    label: `desde ${monthName}${yearStr ? ` de ${yearStr}` : ''}`,
    granularity: 'month',
  });
}

// resolveRuntimeTemporal só reconhece "este mês"/"esta semana"/"este ano";
// "esse mês"/"essa semana"/"esse ano" (tão comuns na fala quanto "este") são
// canonicalizados aqui ANTES de delegar -- sem alterar o arquivo original.
// BUG REAL (Sprint 2.1, BUG 3): "nesse mês"/"nessa semana" (contração "em
// esse/essa") não eram reconhecidos -- só a forma sem contração.
function canonicalizeDemonstratives(text) {
  return text
    .replace(/\bness[ae]\b(?=\s+(?:m[eê]s|semana|ano)\b)/gi, (match) => (
      match.toLowerCase() === 'nessa' ? 'esta' : 'este'
    ))
    .replace(/\bess[ae]\b(?=\s+(?:m[eê]s|semana|ano)\b)/gi, (match) => (
      match.toLowerCase() === 'essa' ? 'esta' : 'este'
    ));
}

export function resolveTemporalRange(text, referenceDate = null) {
  if (typeof text !== 'string' || !text.trim()) {
    return { status: 'not_recognized' };
  }

  const canonicalText = canonicalizeDemonstratives(text);

  const namedRange = resolveNamedMonthRange(canonicalText, referenceDate);
  if (namedRange) return namedRange;

  const semester = resolveSemester(canonicalText, referenceDate);
  if (semester) return semester;

  const sinceNamed = resolveSinceNamedMonth(canonicalText, referenceDate);
  if (sinceNamed) return sinceNamed;

  const singleDayExtra = resolveSingleDayExtras(canonicalText, referenceDate);
  if (singleDayExtra) return singleDayExtra;

  const week = resolveWeekRange(canonicalText, referenceDate);
  if (week) return week;

  const runtime = resolveRuntimeTemporal(canonicalText, todayIso(referenceDate));
  const DAY_GRANULARITY_ENTITIES = new Set([
    'today', 'yesterday', 'last_n_days', 'date_range', 'specific_date',
  ]);
  if (runtime?.entity && runtime.start && runtime.end) {
    return resolved({
      start: runtime.start,
      end: runtime.end,
      label: runtime.label ?? runtime.entity,
      granularity: DAY_GRANULARITY_ENTITIES.has(runtime.entity) ? 'day' : 'month',
    });
  }
  if (runtime?.entity && runtime.date) {
    return resolved({ start: runtime.date, end: runtime.date, label: runtime.label ?? runtime.entity, granularity: 'day' });
  }

  return { status: 'not_recognized' };
}
