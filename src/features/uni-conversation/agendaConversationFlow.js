import {
  cancelPendingAction,
  completePendingAction,
  createPendingActionStack,
  getActivePendingAction,
  pushPendingAction,
  updatePendingAction,
} from './pendingActionStack.js';
import { classifyIntent, normalizeFinancialText, resolveRelativeDateExpression } from '../uni-intents/index.js';
import {
  createAgendaClientOperationId,
  createAgendaItem,
  deleteAgendaItem,
  listAgendaItems,
  setAgendaItemStatus,
  updateAgendaItem,
} from '../../services/agendaService.js';
import {
  clearAgendaOperation,
  getOrCreateAgendaOperation,
} from '../../services/agendaOperationStore.js';
import { AGENDA_IDEMPOTENCY_ENABLED } from '../../services/agendaIdempotencyConfig.js';

const AGENDA_INTENTS = new Set([
  'agenda_reminder_create',
  'agenda_schedule_create',
  'agenda_edit',
  'agenda_complete',
  'agenda_cancel',
  'agenda_query',
  'agenda_no_time',
  'agenda_financial_conflict',
]);

const PENDING_TYPES = Object.freeze({
  CREATE: 'agenda_create',
  CANCEL: 'agenda_cancel_confirmation',
  DISAMBIGUATE: 'agenda_disambiguation',
  EDIT: 'agenda_edit_details',
  FINANCIAL_CONFLICT: 'agenda_financial_conflict',
});

const NUMBER_WORDS = Object.freeze({
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezassete: 17, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40,
  cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
});

const SPOKEN_HOUR_PATTERN = [
  'vinte(?:\\s+e\\s+(?:uma|duas|tres))?',
  'uma', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quatorze', 'quinze',
  'dezesseis', 'dezassete', 'dezessete', 'dezoito', 'dezenove',
].join('|');
const SPOKEN_NUMBER_TOKEN_PATTERN = [
  'uma', 'um', 'duas', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quatorze', 'quinze', 'dezesseis',
  'dezassete', 'dezessete', 'dezoito', 'dezenove', 'vinte', 'trinta', 'quarenta',
  'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa',
].join('|');
const SPOKEN_MINUTE_PATTERN = [
  '\\d{1,2}',
  '(?:vinte|trinta|quarenta|cinquenta)\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)',
  'zero', 'um', 'uma', 'dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete',
  'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quatorze', 'quinze',
  'dezesseis', 'dezassete', 'dezessete', 'dezoito', 'dezenove', 'vinte', 'trinta',
  'quarenta', 'cinquenta', 'meia',
].join('|');
const NUMBER_PHRASE_PATTERN = `(?:\\d{1,3}|${SPOKEN_NUMBER_TOKEN_PATTERN}(?:\\s+e\\s+${SPOKEN_NUMBER_TOKEN_PATTERN})?)`;
const LEXICAL_WORD_PATTERN = '[a-z][a-z-]*';
const NON_QUANTITY_TEMPORAL_WORDS = new Set([
  'a', 'as', 'ate', 'com', 'da', 'das', 'de', 'do', 'e', 'h', 'hora', 'horas',
  'minuto', 'minutos', 'manha', 'noite', 'para', 'sobre', 'tarde',
]);
export const AGENDA_TIME_CLASSIFICATION = Object.freeze({
  SINGLE_TIME: 'SINGLE_TIME',
  TIME_RANGE: 'TIME_RANGE',
  TIME_PLUS_QUANTITY: 'TIME_PLUS_QUANTITY',
  INVALID_TIME: 'INVALID_TIME',
  AMBIGUOUS_MULTI_TIME: 'AMBIGUOUS_MULTI_TIME',
  NON_TEMPORAL_CONTENT: 'NON_TEMPORAL_CONTENT',
});
const TEMPORAL_REGION_TYPE = Object.freeze({
  CLOCK_TIME: 'CLOCK_TIME',
  DURATION: 'DURATION',
  INVALID_TIME: 'INVALID_TIME',
});
const AGENDA_DATE_CONTEXT_PATTERN = [
  'hoje',
  'amanha',
  'depois\\s+de\\s+amanha',
  '(?:semana|mes)\\s+que\\s+vem',
  'proxim[ao]\\s+(?:semana|mes)',
  '(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?(?:\\s+que\\s+vem)?',
  'dia\\s+\\d{1,2}',
  '\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?',
].join('|');
const SPOKEN_TIME_WITH_CUE = new RegExp(
  `\\b(?:as|das)\\s+(${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?\\b`,
);
const SPOKEN_TIME_WITH_PARA = new RegExp(
  `\\bpara\\s+(${SPOKEN_HOUR_PATTERN})(?:(?:\\s+horas?)(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?|\\s+(da\\s+manha|da\\s+tarde|da\\s+noite)|(?=\\s*[.!?]?$))`,
);
const SPOKEN_TIME_WITH_HOURS = new RegExp(
  `^(${SPOKEN_HOUR_PATTERN})\\s+horas?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?[.!?]?$`,
);
const CONTEXTUAL_NUMERIC_TIME = new RegExp(
  `\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(\\d{1,2})(?:[:h](\\d{2}))?(?:\\s*(?:horas?|h)\\b|(?=\\s*[.!?]?$))`,
);
const CONTEXTUAL_NUMERIC_TIME_WITH_PERIOD = new RegExp(
  `\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(\\d{1,2})(?:[:h](\\d{2}))?\\s*(?:horas?|h)?\\s+(da\\s+manha|da\\s+tarde|da\\s+noite)\\b`,
);
const CONTEXTUAL_SPOKEN_TIME = new RegExp(
  `\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(${SPOKEN_HOUR_PATTERN})(?:(?:\\s+horas?)?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))|\\s+horas?\\b|(?=\\s*[.!?]?$))`,
);
const SPOKEN_TIME_WITH_PERIOD = new RegExp(
  `\\b(${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?\\s+(da\\s+manha|da\\s+tarde|da\\s+noite)\\b`,
);
const INVALID_TIME_CORRECTION_TEXT = 'Não consegui entender o horário. Pode informar novamente, por exemplo “10h30” ou “dez horas”?';

const WEEKDAYS = Object.freeze([
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado',
]);

const defaultServices = Object.freeze({
  createAgendaItem,
  deleteAgendaItem,
  listAgendaItems,
  setAgendaItemStatus,
  updateAgendaItem,
});

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftDate(value, days) {
  const date = parseIsoDate(value);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function parseCount(value) {
  const normalized = normalizeFinancialText(value);
  if (/^\d{1,3}$/.test(normalized)) return Number(normalized);
  if (Object.hasOwn(NUMBER_WORDS, normalized)) return NUMBER_WORDS[normalized];
  const compound = normalized.match(/^(vinte|trinta|quarenta|cinquenta)\s+e\s+(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)$/);
  return compound ? NUMBER_WORDS[compound[1]] + NUMBER_WORDS[compound[2]] : null;
}

function stripUniVocative(text) {
  return normalizeFinancialText(text)
    .replace(/^\s*(?:(?:fala|ei)\s+uni(?:\s*[,;:!?.-]\s*|\s+)|uni\s*[,;:!?.-]\s*)/, '')
    .trim();
}

function resolveAgendaDate(text, referenceDate) {
  const normalized = normalizeFinancialText(text);
  const relative = normalized.match(/\bdaqui\s+(?:a\s+|uns?\s+|umas?\s+|cerca\s+de\s+)?([\w\s]+?)\s+(dias?|semanas?)\b/);
  if (relative) {
    const count = parseCount(relative[1]);
    if (count && count <= 365) {
      return shiftDate(referenceDate, count * (relative[2].startsWith('semana') ? 7 : 1));
    }
  }

  const nextWeekday = normalized.match(
    /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\s+que\s+vem\b/,
  );
  if (nextWeekday) {
    const reference = parseIsoDate(referenceDate);
    if (!reference) return null;
    const weekdayIndex = WEEKDAYS.indexOf(nextWeekday[1]);
    const nextOccurrence = (weekdayIndex - reference.getDay() + 7) % 7;
    return shiftDate(referenceDate, nextOccurrence + 7);
  }

  const weekdayIndex = WEEKDAYS.findIndex((weekday) => (
    new RegExp(`\\b${weekday}(?:-feira)?\\b`).test(normalized)
  ));
  if (weekdayIndex >= 0) {
    const reference = parseIsoDate(referenceDate);
    if (!reference) return null;
    const diff = (weekdayIndex - reference.getDay() + 7) % 7;
    return shiftDate(referenceDate, diff);
  }

  return resolveRelativeDateExpression(text, referenceDate).resolvedDate;
}

function formatExtractedTime(hoursValue, minutesValue = 0, period = '') {
  if (hoursValue == null) return null;
  let hours = Number(hoursValue);
  const minutes = Number(minutesValue ?? 0);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23 || minutes > 59) return null;
  if (/\bnoite\b/.test(period) && hours === 12) hours = 0;
  else if (/\b(?:tarde|noite)\b/.test(period) && hours < 12) hours += 12;
  if (/\bmanha\b/.test(period) && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeTimeReply(text) {
  return normalizeFinancialText(text)
    .replace(/^(?:(?:sim|isso|beleza|entao|certo)\s*[,;:]?\s*|pode\s+ser\s+|coloca\s+)/, '')
    .replace(/[.!?]+$/, '')
    .trim();
}

const DAY_PERIOD_PATTERN = 'da\\s+(?:manha|tarde|noite)';
const EXPLICIT_CLOCK_ATOM_PATTERN = [
  `\\d{1,2}(?::\\d{2}|\\s*h(?:\\s*\\d{2})?|\\s+horas?)`,
  `(?:${SPOKEN_HOUR_PATTERN})\\s*(?:h|horas?)`,
].join('|');
const CLOCK_ENDPOINT_PATTERN = `(?:(?:${EXPLICIT_CLOCK_ATOM_PATTERN})(?:\\s+${DAY_PERIOD_PATTERN})?|(?:\\d{1,2}|${SPOKEN_HOUR_PATTERN})\\s+${DAY_PERIOD_PATTERN})`;
const BARE_CLOCK_ENDPOINT_PATTERN = `(?:\\d{1,2}|${SPOKEN_HOUR_PATTERN})(?:\\s+${DAY_PERIOD_PATTERN})?`;
const PAIRED_CLOCK_ENDPOINT_PATTERN = `(?:${CLOCK_ENDPOINT_PATTERN}|${BARE_CLOCK_ENDPOINT_PATTERN})`;
const HYBRID_CLOCK_PATTERN = `(?:\\d{1,2}|${SPOKEN_HOUR_PATTERN})\\s*(?:h|horas?)\\s*(?:e\\s+)?(?:${SPOKEN_MINUTE_PATTERN}|${SPOKEN_NUMBER_TOKEN_PATTERN})(?:\\s+minutos?)?(?:\\s+${DAY_PERIOD_PATTERN})?`;

function resultSpan(match) {
  return { start: match.index, end: match.index + match[0].length };
}

function followingWord(normalized, end) {
  return normalized.slice(end).match(new RegExp(`^\\s+(${LEXICAL_WORD_PATTERN})\\b`))?.[1] ?? null;
}

function isNonTemporalQuantityWord(word) {
  return Boolean(word) && !NON_QUANTITY_TEMPORAL_WORDS.has(word);
}

function parseClockAtom(value) {
  const normalized = normalizeFinancialText(value)
    .replace(/^(?:as|das|umas)\s+/, '')
    .replace(/[.!?]+$/, '')
    .trim();
  if (/^(?:a\s+)?meia[-\s]noite$/.test(normalized)) return '00:00';
  if (/^(?:ao\s+)?meio[-\s]dia$/.test(normalized)) return '12:00';
  const hybrid = normalized.match(
    new RegExp(
      `^(${SPOKEN_HOUR_PATTERN}|\\d{1,2})\\s*(?:h|horas?)\\s*(?:e\\s+)?(${SPOKEN_MINUTE_PATTERN}|${SPOKEN_NUMBER_TOKEN_PATTERN})(?:\\s+minutos?)?(?:\\s+(${DAY_PERIOD_PATTERN}))?$`,
    ),
  );
  if (hybrid) {
    const hour = /^\d+$/.test(hybrid[1]) ? Number(hybrid[1]) : parseCount(hybrid[1]);
    const minute = hybrid[2] === 'meia' ? 30 : parseCount(hybrid[2]);
    return formatExtractedTime(hour, minute, hybrid[3]);
  }

  const numeric = normalized.match(
    /^(\d{1,2})(?:(?::|h)\s*(\d{2}))?\s*(?:horas?|h)?(?:\s+(da\s+(?:manha|tarde|noite)))?$/,
  );
  if (numeric) return formatExtractedTime(numeric[1], numeric[2], numeric[3]);

  const spoken = normalized.match(
    new RegExp(`^(${SPOKEN_HOUR_PATTERN})\\s*(?:h|horas?)(?:\\s+(${DAY_PERIOD_PATTERN}))?$`),
  );
  if (spoken) return formatExtractedTime(parseCount(spoken[1]), 0, spoken[2]);

  const spokenWithPeriod = normalized.match(
    new RegExp(`^(${SPOKEN_HOUR_PATTERN})\\s+(${DAY_PERIOD_PATTERN})$`),
  );
  if (spokenWithPeriod) {
    return formatExtractedTime(parseCount(spokenWithPeriod[1]), 0, spokenWithPeriod[2]);
  }

  const bareSpoken = normalized.match(new RegExp(`^(${SPOKEN_HOUR_PATTERN})$`));
  return bareSpoken ? formatExtractedTime(parseCount(bareSpoken[1]), 0) : null;
}

function hasHybridTimeContext(normalized, match, allowContextual) {
  if (/^(?:as|das|umas)\s+/.test(match[0])) return true;
  if (!allowContextual) return false;
  const before = normalized.slice(0, match.index);
  if (new RegExp(`(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s*$`).test(before)) return true;
  const outside = `${before} ${normalized.slice(match.index + match[0].length)}`
    .replace(/[.!?]+/g, ' ')
    .trim();
  return outside === '';
}

function findTimePlusQuantity(normalized) {
  const pattern = new RegExp(
    `\\b((?:(?:as|das)\\s+)?(${CLOCK_ENDPOINT_PATTERN}))\\s+(para|com|ate)\\s+(${NUMBER_PHRASE_PATTERN})\\s+(${LEXICAL_WORD_PATTERN})\\b`,
    'g',
  );
  for (const match of normalized.matchAll(pattern)) {
    if (!isNonTemporalQuantityWord(match[5])) continue;
    const time = parseClockAtom(match[1]);
    if (!time) continue;
    return {
      kind: AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY,
      time,
      span: resultSpan(match),
      timeSpan: { start: match.index, end: match.index + match[1].length },
      invalidCandidate: null,
    };
  }
  return null;
}

function findBareTimePlusQuantity(normalized) {
  const pattern = new RegExp(
    `\\b(${BARE_CLOCK_ENDPOINT_PATTERN})\\s+(para|com|ate)\\s+(${NUMBER_PHRASE_PATTERN})\\s+(${LEXICAL_WORD_PATTERN})\\b`,
    'g',
  );
  for (const match of normalized.matchAll(pattern)) {
    if (!isNonTemporalQuantityWord(match[4])) continue;
    const time = parseClockAtom(match[1]);
    if (!time) continue;
    return {
      kind: AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY,
      time,
      span: resultSpan(match),
      timeSpan: { start: match.index, end: match.index + match[1].length },
      invalidCandidate: null,
    };
  }
  return null;
}

function findContextualColloquialQuantity(normalized) {
  const pattern = new RegExp(
    `\\b(?:(?:as|umas)\\s+)?(?:${SPOKEN_HOUR_PATTERN}|\\d{1,2})\\s+e\\s+(?:${SPOKEN_MINUTE_PATTERN})\\s+(?!(?:a|as|ate|com|da|das|de|do|e|manha|noite|para|sobre|tarde)\\b)(${LEXICAL_WORD_PATTERN})\\b`,
    'g',
  );
  for (const match of normalized.matchAll(pattern)) {
    if (/^horas?$/.test(match[1]) && !/\se\s+meia\s+horas?$/.test(match[0])) continue;
    if (
      !isNonTemporalQuantityWord(match[1])
      && !/^(?:h|horas?|minutos?)$/.test(match[1])
    ) continue;
    return {
      kind: AGENDA_TIME_CLASSIFICATION.NON_TEMPORAL_CONTENT,
      time: null,
      span: resultSpan(match),
      timeSpan: null,
      invalidCandidate: null,
    };
  }
  return null;
}

function findRangeOrMultipleTimes(normalized) {
  const endpoint = `(?:as\\s+)?${CLOCK_ENDPOINT_PATTERN}`;
  const rangePatterns = [
    `\\b(?:das|de)\\s+${endpoint}\\s+(?:a|as)\\s+${endpoint}\\b`,
    `\\bentre\\s+${endpoint}\\s+e\\s+${endpoint}\\b`,
    `\\b${endpoint}\\s+ate(?:\\s+(?:a|as))?\\s+${endpoint}\\b`,
    `\\b${endpoint}\\s+as\\s+${endpoint}\\b`,
  ];
  for (const source of rangePatterns) {
    const match = normalized.match(new RegExp(source));
    if (match) {
      const span = resultSpan(match);
      return {
        kind: AGENDA_TIME_CLASSIFICATION.TIME_RANGE,
        time: null,
        span,
        timeSpan: null,
        invalidCandidate: span,
      };
    }
  }

  const ambiguousPatterns = [
    `\\b${endpoint}\\s+para\\s+${endpoint}\\b`,
    `\\b${endpoint}\\s+para\\s+(?:as\\s+)?${NUMBER_PHRASE_PATTERN}(?=\\s*[.!?]?$)`,
    `\\b${endpoint}\\s+e\\s+${endpoint}\\b`,
    `\\b(?!vinte\\s+e\\s+(?:uma|duas|tres)\\s*(?:h|horas?)\\b)(?:${SPOKEN_HOUR_PATTERN}|\\d{1,2})\\s+e\\s+(?:${SPOKEN_HOUR_PATTERN}|\\d{1,2})\\s*(?:h|horas?)\\b`,
  ];
  for (const source of ambiguousPatterns) {
    const match = normalized.match(new RegExp(source));
    if (match) {
      const span = resultSpan(match);
      return {
        kind: AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME,
        time: null,
        span,
        timeSpan: null,
        invalidCandidate: span,
      };
    }
  }
  return null;
}

function findSeparatedTemporalEndpoints(normalized) {
  const pattern = new RegExp(
    `\\b(${PAIRED_CLOCK_ENDPOINT_PATTERN})(?:\\s*([-–—/,;])\\s*|\\s+(ate(?:\\s+(?:a|as))?|as|a|para|e)\\s+)(${PAIRED_CLOCK_ENDPOINT_PATTERN})\\b`,
    'g',
  );
  for (const match of normalized.matchAll(pattern)) {
    if (/^vinte\s+e\s+(?:uma|duas|tres)(?:\s*(?:h|horas?))?(?:\s+da\s+(?:manha|tarde|noite))?$/.test(match[0])) {
      continue;
    }
    const firstTime = parseClockAtom(match[1]);
    const secondTime = parseClockAtom(match[4]);
    if (!firstTime || !secondTime) continue;

    const normalizedSeparator = (match[2] ?? match[3]).replace(/\s+/g, ' ').trim();
    const afterMatch = normalized.slice(match.index + match[0].length);
    if (normalizedSeparator === '/' && /^\/\d/.test(afterMatch)) continue;
    if (normalizedSeparator === 'e' && !hasExplicitClockMarker(match[4])) {
      const secondHour = Number(secondTime.slice(0, 2));
      if (secondHour === 0 || secondHour > 12) continue;
    }

    const span = resultSpan(match);
    const beforeMatch = normalized.slice(0, match.index);
    const isRange = /^(?:ate|ate a|ate as|as|a)$/.test(normalizedSeparator)
      || /\bentre\s*$/.test(beforeMatch);
    return {
      kind: isRange
        ? AGENDA_TIME_CLASSIFICATION.TIME_RANGE
        : AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME,
      time: null,
      span,
      timeSpan: null,
      invalidCandidate: span,
      hasMultipleEndpoints: true,
    };
  }
  return null;
}

function spansOverlap(left, right) {
  return Boolean(left && right && left.start < right.end && right.start < left.end);
}

function hasImmediateDateContext(normalized, start) {
  return new RegExp(`(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s*$`).test(
    normalized.slice(0, start),
  );
}

function isDurationCandidate(normalized, candidate) {
  if (!/\bhoras?\b/.test(candidate.source)) return false;
  if (/^meia\s+horas?\b/.test(candidate.source)) return true;
  if (/^(?:as|das|umas)\s+/.test(candidate.source)) return false;
  if (/\bda\s+(?:manha|tarde|noite)\b/.test(candidate.source)) return false;
  if (hasImmediateDateContext(normalized, candidate.span.start)) return false;

  const before = normalized.slice(0, candidate.span.start);
  const after = normalized.slice(candidate.span.end);
  const durationCue = /\b(?:duracao\s+de|durante|por|sobre|discutir|analisar)\s*$/.test(before);
  const contentAfter = after.match(new RegExp(`^\\s+(?:de\\s+)?(${LEXICAL_WORD_PATTERN})\\b`));
  return durationCue || Boolean(
    contentAfter
    && !/^(?:da|de|do|manha|tarde|noite)$/.test(contentAfter[1]),
  );
}

function annotateCandidateSemantics(normalized, candidate) {
  if (isDurationCandidate(normalized, candidate)) {
    return { ...candidate, semanticType: TEMPORAL_REGION_TYPE.DURATION };
  }
  return {
    ...candidate,
    semanticType: candidate.time
      ? TEMPORAL_REGION_TYPE.CLOCK_TIME
      : TEMPORAL_REGION_TYPE.INVALID_TIME,
  };
}

function discoverTemporalCandidates(normalized) {
  const candidates = [];
  const attemptedMinute = `(?:\\d{1,3}|${NUMBER_PHRASE_PATTERN})`;
  const attemptedHour = `(?:\\d{1,3}|${SPOKEN_HOUR_PATTERN})`;
  const attemptedHybrid = `${attemptedHour}\\s*(?:h|horas?)\\s*(?:e\\s+)?${attemptedMinute}(?:\\s+minutos?)?(?:\\s+${DAY_PERIOD_PATTERN})?`;
  const attemptedExplicitClock = [
    `\\d{1,3}(?::\\d{0,3}|\\s*h(?:\\s*\\d{0,3})?|\\s+horas?)(?:\\s+${DAY_PERIOD_PATTERN})?`,
    `(?:${NUMBER_PHRASE_PATTERN})\\s*(?:h|horas?)(?:\\s+${DAY_PERIOD_PATTERN})?`,
    `(?:\\d{1,3}|${NUMBER_PHRASE_PATTERN})\\s+${DAY_PERIOD_PATTERN}`,
  ].join('|');

  const collect = (pattern, valueIndex) => {
    for (const match of normalized.matchAll(pattern)) {
      const value = match[valueIndex];
      const span = resultSpan(match);
      candidates.push({
        span,
        time: parseClockAtom(value),
        source: match[0],
      });
    }
  };

  for (const match of normalized.matchAll(/\b(?:(?:a|ao)\s+)?(?:meia[-\s]noite|meio[-\s]dia)\b/g)) {
    candidates.push({
      span: resultSpan(match),
      time: parseClockAtom(match[0]),
      source: match[0],
    });
  }

  collect(
    new RegExp(`\\b(?:(?:as|das|para|umas)\\s+)?(${attemptedHybrid})\\b`, 'g'),
    1,
  );
  collect(
    new RegExp(`\\b(?:(?:as|das|para|umas)\\s+)?(${attemptedExplicitClock})\\b`, 'g'),
    1,
  );
  collect(
    new RegExp(
      `\\b(?:(?:as|das|umas)\\s+)?(${SPOKEN_HOUR_PATTERN})\\s*(?:h|horas?)(?:\\s+${DAY_PERIOD_PATTERN})?\\b`,
      'g',
    ),
    1,
  );

  const explicitDuration = new RegExp(
    `\\b(meia|\\d{1,3}|${NUMBER_PHRASE_PATTERN})\\s+horas?\\b`,
    'g',
  );
  for (const match of normalized.matchAll(explicitDuration)) {
    candidates.push({
      span: resultSpan(match),
      time: parseClockAtom(match[0]),
      source: match[0],
    });
  }

  const colloquial = new RegExp(
    `\\b(?:(?:as|umas)\\s+)?(${SPOKEN_HOUR_PATTERN}|\\d{1,2})\\s+e\\s+(${SPOKEN_MINUTE_PATTERN})(?:\\s+(${DAY_PERIOD_PATTERN}))?\\b(?!\\s+horas?\\b)`,
    'g',
  );
  for (const match of normalized.matchAll(colloquial)) {
    candidates.push({
      span: resultSpan(match),
      time: formatExtractedTime(
        /^\\d+$/.test(match[1]) ? Number(match[1]) : parseCount(match[1]),
        match[2] === 'meia' ? 30 : parseCount(match[2]),
        match[3],
      ),
      source: match[0],
    });
  }

  const bareWithCue = new RegExp(
    `\\b(as|das|para|umas)\\s+(${SPOKEN_HOUR_PATTERN}|\\d{1,3})(?:\\s+${DAY_PERIOD_PATTERN})?\\b`,
    'g',
  );
  for (const match of normalized.matchAll(bareWithCue)) {
    const span = resultSpan(match);
    if (
      match[1] === 'para'
      && isNonTemporalQuantityWord(followingWord(normalized, span.end))
    ) {
      continue;
    }
    candidates.push({
      span,
      time: parseClockAtom(match[2]),
      source: match[0],
    });
  }

  if (normalized) {
    const contextualBare = new RegExp(
      `\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(${SPOKEN_HOUR_PATTERN}|\\d{1,2})(?:\\s+${DAY_PERIOD_PATTERN})?(?=\\s*[.!?]?$)`,
      'g',
    );
    for (const match of normalized.matchAll(contextualBare)) {
      const value = match[1];
      const relativeStart = match[0].lastIndexOf(value);
      const start = match.index + relativeStart;
      const periodSuffix = match[0].slice(relativeStart + value.length);
      const source = `${value}${periodSuffix}`.trim();
      candidates.push({
        span: { start, end: match.index + match[0].length },
        time: parseClockAtom(source),
        source,
      });
    }
  }

  const ordered = candidates.sort((left, right) => (
    left.span.start - right.span.start
    || (right.span.end - right.span.start) - (left.span.end - left.span.start)
  ));
  const consolidated = [];
  for (const candidate of ordered) {
    const overlappingIndex = consolidated.findIndex((current) => (
      spansOverlap(current.span, candidate.span)
    ));
    if (overlappingIndex < 0) {
      consolidated.push(candidate);
      continue;
    }
    const current = consolidated[overlappingIndex];
    const currentLength = current.span.end - current.span.start;
    const candidateLength = candidate.span.end - candidate.span.start;
    if (candidateLength > currentLength) consolidated[overlappingIndex] = candidate;
  }
  const nonOverlapping = consolidated.sort((left, right) => left.span.start - right.span.start);
  const merged = [];
  for (const candidate of nonOverlapping) {
    const previous = merged.at(-1);
    const between = previous
      ? normalized.slice(previous.span.end, candidate.span.start)
      : '';
    if (
      previous
      && /^(?:as|das|para|umas)\s+/.test(previous.source)
      && !hasExplicitClockMarker(previous.source)
      && /^\s+e\s+$/.test(between)
      && hasExplicitClockMarker(candidate.source)
    ) {
      const span = { start: previous.span.start, end: candidate.span.end };
      const source = normalized.slice(span.start, span.end);
      merged[merged.length - 1] = {
        span,
        time: parseClockAtom(source),
        source,
      };
      continue;
    }
    merged.push(candidate);
  }
  return merged.map((candidate) => annotateCandidateSemantics(normalized, candidate));
}

function locateResolvedTimeSpan(normalized, allowContextual, time, candidates) {
  const colloquial = matchColloquialTime(normalized, allowContextual);
  if (colloquial && formatColloquialTime(colloquial) === time) return resultSpan(colloquial);
  return candidates.find((candidate) => candidate.time === time)?.span ?? null;
}

function consolidateTemporalCoverage(normalized, analysis, allowContextual) {
  const candidates = discoverTemporalCandidates(normalized);
  const clockCandidates = candidates.filter((candidate) => (
    candidate.semanticType !== TEMPORAL_REGION_TYPE.DURATION
  ));
  if (analysis.kind === AGENDA_TIME_CLASSIFICATION.INVALID_TIME) {
    return { ...analysis, candidates };
  }
  if ([
    AGENDA_TIME_CLASSIFICATION.TIME_RANGE,
    AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME,
  ].includes(analysis.kind)) {
    return { ...analysis, candidates };
  }

  const primarySpan = analysis.time
    ? analysis.timeSpan
      ?? analysis.span
      ?? locateResolvedTimeSpan(normalized, allowContextual, analysis.time, clockCandidates)
    : null;
  const invalidCandidates = clockCandidates.filter((candidate) => (
    candidate.semanticType === TEMPORAL_REGION_TYPE.INVALID_TIME
    && !spansOverlap(primarySpan, candidate.span)
  ));
  if (invalidCandidates.length) {
    const invalidCandidate = invalidCandidates[0].span;
    return {
      kind: AGENDA_TIME_CLASSIFICATION.INVALID_TIME,
      time: null,
      span: invalidCandidate,
      timeSpan: null,
      invalidCandidate,
      hasMultipleEndpoints: Boolean(
        analysis.time
        || clockCandidates.some((candidate) => candidate.time)
        || analysis.hasMultipleEndpoints
      ),
      candidates,
    };
  }

  if (!analysis.time) return { ...analysis, candidates };

  let remaining = primarySpan
    ? clockCandidates.filter((candidate) => !spansOverlap(primarySpan, candidate.span))
    : [...clockCandidates];
  if (!primarySpan) {
    const representedIndex = remaining.findIndex((candidate) => candidate.time === analysis.time);
    if (representedIndex >= 0) {
      remaining = [
        ...remaining.slice(0, representedIndex),
        ...remaining.slice(representedIndex + 1),
      ];
    }
  }
  if (!remaining.length) {
    return {
      ...analysis,
      timeSpan: analysis.timeSpan ?? primarySpan,
      candidates,
    };
  }

  const starts = [primarySpan, ...remaining.map((candidate) => candidate.span)]
    .filter(Boolean)
    .map((span) => span.start);
  const ends = [primarySpan, ...remaining.map((candidate) => candidate.span)]
    .filter(Boolean)
    .map((span) => span.end);
  const span = starts.length
    ? { start: Math.min(...starts), end: Math.max(...ends) }
    : remaining[0].span;
  return {
    kind: AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME,
    time: null,
    span,
    timeSpan: null,
    invalidCandidate: span,
    hasMultipleEndpoints: true,
    candidates,
  };
}

function findHybridTime(normalized, allowContextual) {
  const pattern = new RegExp(`\\b(?:(?:as|das|umas)\\s+)?${HYBRID_CLOCK_PATTERN}\\b`, 'g');
  for (const match of normalized.matchAll(pattern)) {
    if (!hasHybridTimeContext(normalized, match, allowContextual)) continue;
    const time = parseClockAtom(match[0]);
    const span = resultSpan(match);
    return {
      kind: time
        ? AGENDA_TIME_CLASSIFICATION.SINGLE_TIME
        : AGENDA_TIME_CLASSIFICATION.INVALID_TIME,
      time,
      span,
      timeSpan: time ? span : null,
      invalidCandidate: time ? null : span,
    };
  }
  return null;
}

function classifyStructuralTemporalRegion(normalized, allowContextual) {
  return findContextualColloquialQuantity(normalized)
    ?? findTimePlusQuantity(normalized)
    ?? findBareTimePlusQuantity(normalized)
    ?? findSeparatedTemporalEndpoints(normalized)
    ?? findRangeOrMultipleTimes(normalized)
    ?? findHybridTime(normalized, allowContextual);
}

function matchColloquialTime(normalized, allowContextual) {
  const hour = `(${SPOKEN_HOUR_PATTERN}|\\d{1,2})`;
  const minute = `(${SPOKEN_MINUTE_PATTERN})`;
  const period = '(da\\s+manha|da\\s+tarde|da\\s+noite)';
  const withCue = normalized.match(
    new RegExp(`\\b(?:as|umas)\\s+${hour}\\s+e\\s+${minute}(?:\\s+${period})?\\b(?!\\s+horas?\\b)`),
  );
  if (withCue && formatColloquialTime(withCue)) return withCue;
  if (allowContextual) {
    const contextual = normalized.match(
      new RegExp(`\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(?:as\\s+|umas\\s+)?${hour}\\s+e\\s+${minute}(?:\\s+${period})?\\b(?!\\s+horas?\\b)`),
    );
    if (contextual && formatColloquialTime(contextual)) return contextual;
  }
  const standalone = normalized.match(
    new RegExp(`^(?:as\\s+|umas\\s+)?${hour}\\s+e\\s+${minute}(?:\\s+${period})?(?!\\s+horas?\\b)$`),
  );
  return standalone && formatColloquialTime(standalone) ? standalone : null;
}

function formatColloquialTime(match) {
  if (!match) return null;
  const hours = /^\d+$/.test(match[1]) ? Number(match[1]) : parseCount(match[1]);
  const minutes = match[2] === 'meia' ? 30 : parseCount(match[2]);
  return formatExtractedTime(hours, minutes, match[3]);
}

function hasExplicitClockMarker(normalized) {
  return new RegExp(
    `\\b(?:\\d{1,2}(?::\\d{2}|\\s*h\\s*\\d{0,2}|\\s*horas?)|(?:${SPOKEN_HOUR_PATTERN})\\s*(?:h|horas?))\\b`,
  ).test(normalized);
}

function hasExplicitDayPeriod(normalized) {
  return /\b(?:da\s+(?:manha|tarde|noite)|meia[-\s]noite|meio[-\s]dia)\b/.test(normalized);
}

function isPeriodAmbiguous(time, normalized) {
  if (!time || hasExplicitDayPeriod(normalized) || hasExplicitClockMarker(normalized)) return false;
  const hours = Number(time.slice(0, 2));
  return hours >= 1 && hours <= 12;
}

function invalidTimeCandidate(normalized, allowContextual) {
  const supportedColloquial = matchColloquialTime(normalized, allowContextual);
  const prefix = allowContextual
    ? `(?:(?:${AGENDA_DATE_CONTEXT_PATTERN})|as|das|para)\\s+`
    : '(?:as|das|para)\\s+';
  const rangePeriod = '(?:da\\s+(?:manha|tarde|noite))';
  const rangeEndpoint = `(?:\\d{1,2}(?:[:h]\\d{0,2})?(?:\\s*horas?)?(?:\\s+${rangePeriod})?|(?:${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?(?:\\s+${rangePeriod})?)`;
  const range = normalized.match(
    new RegExp(
      `\\b(?:(?:(?:de|das)\\s+)?${rangeEndpoint}\\s+(?:ate(?:\\s+(?:a|as))?|a|as)\\s+${rangeEndpoint}|entre\\s+${rangeEndpoint}\\s+e\\s+${rangeEndpoint})\\b`,
    ),
  );
  if (range) {
    const rangeEnd = range.index + range[0].length;
    if (!isNonTemporalQuantityWord(followingWord(normalized, rangeEnd))) {
      return { start: range.index, end: rangeEnd };
    }
  }

  const attemptedMinute = `(?:\\d{1,3}|${SPOKEN_NUMBER_TOKEN_PATTERN})(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?`;
  const attemptedHour = `(?:\\d{1,2}|${SPOKEN_HOUR_PATTERN})`;
  const attemptedMinuteWithContext = normalized.match(
    new RegExp(
      `\\b(?:(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(?:(?:as|umas)\\s+)?|(?:as|das|para|umas)\\s+)${attemptedHour}\\s+e\\s+${attemptedMinute}(?:\\s+minutos?)?(?:\\s+da\\s+(?:manha|tarde|noite))?\\b(?!\\s+horas?\\b)`,
    ),
  );
  const attemptedMinuteStandalone = normalized.match(
    new RegExp(
      `^(?:(?:as|umas)\\s+)?${attemptedHour}\\s+e\\s+${attemptedMinute}(?:\\s+minutos?)?(?:\\s+da\\s+(?:manha|tarde|noite))?(?!\\s+horas?\\b)[.!?]?$`,
    ),
  );
  const invalidMinuteAttempt = attemptedMinuteWithContext ?? attemptedMinuteStandalone;
  if (invalidMinuteAttempt && !supportedColloquial) {
    return {
      start: invalidMinuteAttempt.index,
      end: invalidMinuteAttempt.index + invalidMinuteAttempt[0].length,
    };
  }

  const unsupportedSpokenMinutesPattern = new RegExp(
    `\\b${prefix}(?:\\d{1,2}|(?:${SPOKEN_HOUR_PATTERN}))\\s*(?:horas?|h)\\s+e\\s+(?:meia|\\d{1,3}|${SPOKEN_NUMBER_TOKEN_PATTERN})(?:\\s+minutos?)?(?:\\s+da\\s+(?:manha|tarde|noite))?\\b`,
  );
  const unsupportedSpokenMinutes = normalized.match(unsupportedSpokenMinutesPattern);
  if (unsupportedSpokenMinutes) {
    return {
      start: unsupportedSpokenMinutes.index,
      end: unsupportedSpokenMinutes.index + unsupportedSpokenMinutes[0].length,
    };
  }
  const numericPattern = new RegExp(
    `\\b${prefix}(\\d{1,3})(?:([:h])(\\d{0,3}))?\\s*(?:horas?|h)?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?(?!\\w)`,
  );
  const numeric = normalized.match(numericPattern);
  if (numeric) {
    const hasColonWithoutMinutes = numeric[2] === ':' && !numeric[3];
    const parsed = hasColonWithoutMinutes
      ? null
      : formatExtractedTime(numeric[1], numeric[3] || 0, numeric[4]);
    if (!parsed) return { start: numeric.index, end: numeric.index + numeric[0].length };
  }

  const spokenCandidate = `(?:${SPOKEN_NUMBER_TOKEN_PATTERN})(?:\\s+e\\s+(?:${SPOKEN_NUMBER_TOKEN_PATTERN}|meia))?`;
  const spokenPattern = new RegExp(
    `\\b${prefix}(${spokenCandidate})(?:\\s+horas?)?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?\\b`,
  );
  const spoken = normalized.match(spokenPattern);
  if (spoken && !supportedColloquial && !formatExtractedTime(parseCount(spoken[1]), 0, spoken[2])) {
    return { start: spoken.index, end: spoken.index + spoken[0].length };
  }

  const standaloneSpoken = normalized.match(
    new RegExp(`^(${spokenCandidate})(?:\\s+horas?)?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?[.!]?$`),
  );
  if (standaloneSpoken && !supportedColloquial && !formatExtractedTime(parseCount(standaloneSpoken[1]), 0, standaloneSpoken[2])) {
    return { start: standaloneSpoken.index, end: standaloneSpoken.index + standaloneSpoken[0].length };
  }

  return null;
}

function detectedDayPeriod(normalized) {
  return normalized.match(/\b(?:da|de|pela|a)\s+(manha|tarde|noite)\b/)?.[1] ?? null;
}

function authoritativeTemporalSpans(analysis, normalized) {
  if (analysis.kind === AGENDA_TIME_CLASSIFICATION.NON_TEMPORAL_CONTENT) return [];
  const candidateSpans = (analysis.candidates ?? [])
    .filter((candidate) => candidate.semanticType !== TEMPORAL_REGION_TYPE.DURATION)
    .map((candidate) => candidate.span)
    .sort((left, right) => left.start - right.start);

  if (candidateSpans.length > 1) {
    const onlyTemporalConnectors = candidateSpans.slice(1).every((span, index) => {
      const gap = normalized.slice(candidateSpans[index].end, span.start).trim();
      return /^(?:(?:ate|as|a|para|e|de|das|entre)\s*|[-–—/,.;:|\s]*)$/.test(gap);
    });
    if (onlyTemporalConnectors) {
      return [{
        start: candidateSpans[0].start,
        end: candidateSpans.at(-1).end,
      }];
    }
    return candidateSpans;
  }

  const primarySpan = analysis.timeSpan ?? analysis.span ?? candidateSpans[0] ?? null;
  return primarySpan ? [primarySpan] : [];
}

function finalizeTemporalAnalysis(analysis, normalized) {
  const blocked = [
    AGENDA_TIME_CLASSIFICATION.TIME_RANGE,
    AGENDA_TIME_CLASSIFICATION.INVALID_TIME,
    AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME,
  ].includes(analysis.kind);
  const titleRemovalSpans = authoritativeTemporalSpans(analysis, normalized);
  const spans = titleRemovalSpans;
  const sanitizedCandidates = (analysis.candidates ?? []).map((candidate) => ({
    span: candidate.span,
    time: candidate.time,
    semanticType: candidate.semanticType,
    valid: candidate.semanticType !== TEMPORAL_REGION_TYPE.INVALID_TIME,
  }));
  return {
    ...analysis,
    candidates: sanitizedCandidates,
    resolvedTime: blocked ? null : analysis.time,
    valid: Boolean(analysis.time) && !blocked,
    blocked,
    invalid: blocked,
    spans,
    temporalTokenRanges: titleRemovalSpans,
    temporalSpans: titleRemovalSpans,
    titleRemovalSpans,
    clockTimes: sanitizedCandidates.filter((candidate) => (
      candidate.semanticType === TEMPORAL_REGION_TYPE.CLOCK_TIME
    )),
    durations: sanitizedCandidates.filter((candidate) => (
      candidate.semanticType === TEMPORAL_REGION_TYPE.DURATION
    )),
    invalidRegions: sanitizedCandidates.filter((candidate) => (
      candidate.semanticType === TEMPORAL_REGION_TYPE.INVALID_TIME
    )),
    period: detectedDayPeriod(normalized),
    hasMultipleEndpoints: analysis.hasMultipleEndpoints ?? [
      AGENDA_TIME_CLASSIFICATION.TIME_RANGE,
      AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME,
    ].includes(analysis.kind),
    hasQuantity: analysis.kind === AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY,
    ambiguousPeriod: analysis.time && !blocked
      ? isPeriodAmbiguous(analysis.time, normalized)
      : false,
  };
}

function analyzeNormalizedTemporalRegion(normalized, allowContextual) {
  let analysis = classifyStructuralTemporalRegion(normalized, allowContextual);
  if (!analysis) {
    const invalidCandidate = invalidTimeCandidate(normalized, allowContextual);
    if (invalidCandidate) {
      analysis = {
        kind: AGENDA_TIME_CLASSIFICATION.INVALID_TIME,
        time: null,
        span: invalidCandidate,
        timeSpan: null,
        invalidCandidate,
      };
    }
  }
  if (!analysis) {
    const time = extractAgendaTimeValue(normalized, allowContextual);
    analysis = {
      kind: time
        ? AGENDA_TIME_CLASSIFICATION.SINGLE_TIME
        : AGENDA_TIME_CLASSIFICATION.NON_TEMPORAL_CONTENT,
      time,
      span: null,
      timeSpan: null,
      invalidCandidate: null,
    };
  }
  return finalizeTemporalAnalysis(
    consolidateTemporalCoverage(normalized, analysis, allowContextual),
    normalized,
  );
}

export function classifyAgendaTemporalRegion(text, { allowContextual = false } = {}) {
  return analyzeNormalizedTemporalRegion(normalizeTimeReply(text), allowContextual);
}

function analyzeAgendaTime(text, options) {
  return classifyAgendaTemporalRegion(text, options);
}

export function extractAgendaTime(text, { allowContextual = false } = {}) {
  return analyzeAgendaTime(text, { allowContextual }).time;
}

function extractAgendaTimeValue(normalized, allowContextual) {
  const namedClock = normalized.match(/\b(?:(?:a|ao)\s+)?(?:meia[-\s]noite|meio[-\s]dia)\b/);
  if (namedClock) return parseClockAtom(namedClock[0]);

  const colloquial = matchColloquialTime(normalized, allowContextual);
  if (colloquial) return formatColloquialTime(colloquial);

  const numericWithPeriod = normalized.match(
    /\b(?:as|das|para)\s+(\d{1,2})(?:[:h](\d{2}))?\s*(?:horas?|h)?\s+(da\s+manha|da\s+tarde|da\s+noite)\b/,
  );
  if (numericWithPeriod) {
    return formatExtractedTime(numericWithPeriod[1], numericWithPeriod[2], numericWithPeriod[3]);
  }

  let numeric = normalized.match(
    new RegExp(
      '\\b(?:as|das|para)\\s+(\\d{1,2})(?:[:h](\\d{2}))?(?:\\s*(?:horas?|h))?\\b',
    ),
  ) ?? normalized.match(/^(\d{1,2})(?:[:h](\d{2}))?\s*(?:horas?|h)?$/);
  if (
    numeric
    && /^para\s+/.test(numeric[0])
    && isNonTemporalQuantityWord(followingWord(normalized, numeric.index + numeric[0].length))
  ) {
    numeric = null;
  }
  if (numeric) return formatExtractedTime(numeric[1], numeric[2]);

  let spoken = normalized.match(SPOKEN_TIME_WITH_CUE)
    ?? normalized.match(SPOKEN_TIME_WITH_PARA)
    ?? normalized.match(SPOKEN_TIME_WITH_HOURS);
  if (
    spoken
    && /^para\s+/.test(spoken[0])
    && isNonTemporalQuantityWord(followingWord(normalized, spoken.index + spoken[0].length))
  ) {
    spoken = null;
  }
  if (spoken) return formatExtractedTime(parseCount(spoken[1]), 0, spoken[2] ?? spoken[3]);

  if (!allowContextual) return null;

  const contextualNumericWithPeriod = normalized.match(CONTEXTUAL_NUMERIC_TIME_WITH_PERIOD);
  if (contextualNumericWithPeriod) {
    return formatExtractedTime(
      contextualNumericWithPeriod[1],
      contextualNumericWithPeriod[2],
      contextualNumericWithPeriod[3],
    );
  }

  const contextualNumeric = normalized.match(CONTEXTUAL_NUMERIC_TIME);
  if (contextualNumeric) {
    return formatExtractedTime(contextualNumeric[1], contextualNumeric[2]);
  }

  const contextualSpoken = normalized.match(CONTEXTUAL_SPOKEN_TIME)
    ?? normalized.match(SPOKEN_TIME_WITH_PERIOD);
  if (contextualSpoken) {
    return formatExtractedTime(parseCount(contextualSpoken[1]), 0, contextualSpoken[2]);
  }

  const contextualNumericPeriod = normalized.match(
    /\b(\d{1,2})(?:[:h](\d{2}))?\s*(?:horas?|h)?\s+(da\s+manha|da\s+tarde|da\s+noite)\b/,
  );
  return contextualNumericPeriod
    ? formatExtractedTime(
      contextualNumericPeriod[1],
      contextualNumericPeriod[2],
      contextualNumericPeriod[3],
    )
    : null;
}

function removeClassifiedTemporalSpans(normalized, classification) {
  const spans = [...(classification?.titleRemovalSpans ?? [])]
    .sort((left, right) => right.start - left.start);
  return spans.reduce((value, span) => (
    `${value.slice(0, span.start)} ${value.slice(span.end)}`
  ), normalized);
}

function extractTitle(text, temporalAnalysis = null) {
  const normalizedText = normalizeFinancialText(text);
  const authoritativeAnalysis = temporalAnalysis
    ?? analyzeNormalizedTemporalRegion(normalizedText, true);
  const classifiedText = removeClassifiedTemporalSpans(normalizedText, authoritativeAnalysis);
  const normalized = classifiedText
    .replace(/\b(?:me\s+)?lembra(?:r)?\s+(?:de|da|do)?\s*/g, '')
    .replace(/\b(?:eu\s+)?tenho\s+que\s+/g, '')
    .replace(/\b(?:eu\s+)?tenho\s+(?:uma|um)?\s*/g, '')
    .replace(/\b(?:bota|anota|marca|agende|agenda|cria)\s+(?:ai\s+)?(?:na\s+agenda\s+)?/g, '')
    .replace(/\b(?:muda|remarca|reagenda|adia|antecipa)\s+(?:meu|minha|o|a)?\s*/g, '')
    .replace(/\b(?:cancela|cancelar|desmarca|desmarcar|exclui|excluir)\s+(?:meu|minha|o|a)?\s*/g, '')
    .replace(/\b(?:ja\s+fiz|conclui|finalizei)\s+(?:aquele|aquela|o|a)?\s*/g, '')
    .replace(/\b(?:pode\s+)?marcar\s+como\s+concluida?\b/g, '')
    .replace(/\bdaqui\s+(?:a\s+|uns?\s+|umas?\s+|cerca\s+de\s+)?[\w\s]+?\s+(?:dias?|semanas?)\b/g, '')
    .replace(/\b(?:hoje|amanha|depois\s+de\s+amanha|fim\s+do\s+mes|final\s+do\s+mes)\b/g, '')
    .replace(/\b(?:o\s+)?dia\s+inteiro\b/g, '')
    .replace(/\b(?:(?:semana|mes)\s+que\s+vem|proxim[ao]\s+(?:semana|mes))\b/g, '')
    .replace(/\b(?:(?:de|na|no|para|pra)\s+)?(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?(?:\s+que\s+vem)?\b/g, '')
    .replace(/\b(?:(?:de|na|no|para|pra)\s+)?dia\s+\d{1,2}\b/g, '')
    .replace(/\b(?:aquele|aquela)\s+(?:coisa|negocio|compromisso)\b/g, '')
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:de|da|do|para|na|no)\s*$/g, '')
    .trim();
  return normalized || null;
}

function capitalizeSentence(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : null;
}

function extractAgendaContent(text, temporalAnalysis = null) {
  const normalized = normalizeFinancialText(text);
  const purpose = normalized.match(
    /\bpara\s+(falar\s+sobre|levar)\s+(.+?)(?=\s+(?:hoje|amanha|depois\s+de\s+amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|dia\s+\d{1,2}|as\s+|umas\s+|\d{1,2}(?:[:h]))|[.!?]?$)/,
  );
  if (!purpose) return { title: extractTitle(text, temporalAnalysis), description: null };

  const title = extractTitle(text, temporalAnalysis)
    ?.replace(purpose[0], ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    title: title || null,
    description: capitalizeSentence(`${purpose[1]} ${purpose[2]}`.trim()),
  };
}

const GENERIC_EDIT_SUBJECTS = new Set([
  'compromisso', 'evento', 'item', 'agenda', 'meu compromisso', 'minha agenda',
]);

function extractExplicitTitleChange(text) {
  const normalized = normalizeFinancialText(text);
  const match = normalized.match(
    /\b(?:titulo|nome)\b(?:\s+(?:do|da|de)\s+(.+?))?\s+(?:para|como)\s+(.+?)(?=\s+e\s+(?:(?:a|o)\s+)?(?:data|horario)\b|$)/,
  );
  if (!match) return { target: null, title: null };
  const title = match[2].replace(/[.,!?]+$/g, '').trim();
  return {
    target: match[1]?.replace(/^(?:meu|minha|o|a)\s+/, '').trim() || null,
    title: title || null,
  };
}

function extractImplicitTitleChange(text) {
  const normalized = normalizeFinancialText(text);
  const match = normalized.match(
    /^\s*(?:muda(?:r)?|altera(?:r)?|edita(?:r)?)\s+(?:meu|minha|o|a)?\s*(.+?)\s+(?:para|pra|como)\s+(.+)$/,
  );
  if (!match) return { target: null, title: null };

  const destination = match[2].replace(/[.,!?]+$/g, '').trim();
  const title = extractTitle(`para ${destination}`)
    ?.replace(/^(?:para|pra|como)\b\s*/, '')
    .trim();
  if (!title || GENERIC_EDIT_SUBJECTS.has(title)) return { target: null, title: null };

  return {
    target: extractTitle(match[1]),
    title,
  };
}

function extractEditTargetSubject(text) {
  const explicitTitle = extractExplicitTitleChange(text);
  if (explicitTitle.target) return explicitTitle.target;

  const normalizedText = normalizeFinancialText(text);
  if (
    /^\s*(?:muda(?:r)?|altera(?:r)?|edita(?:r)?)\s+(?:(?:so|apenas)\s+)?(?:o|a)?\s*(?:horario|data|titulo|nome)\b/.test(normalizedText)
  ) {
    return null;
  }
  const implicitTitle = extractImplicitTitleChange(text);
  if (implicitTitle.target) return implicitTitle.target;

  const normalized = normalizeFinancialText(text)
    .replace(/^\s*(?:muda(?:r)?|remarca(?:r)?|reagenda(?:r)?|adia(?:r)?|passa(?:r)?|antecipa(?:r)?|edita(?:r)?|altera(?:r)?)\s+/, '')
    .replace(/^(?:meu|minha|o|a)\s+/, '');
  const subjectSegment = normalized.split(
    /\b(?:de|para|pra)\s+(?=(?:hoje|amanha|depois\s+de\s+amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|\d{1,2}(?::\d{2})?h?))\b/,
  )[0].trim();
  const subject = extractTitle(subjectSegment);
  return subject && !GENERIC_EDIT_SUBJECTS.has(subject) ? subject : null;
}

function extractEditChanges(text, referenceDate, temporalAnalysis = null) {
  const normalized = normalizeFinancialText(text);
  const explicitTitle = extractExplicitTitleChange(text);
  const implicitTitle = extractImplicitTitleChange(text);
  const destination = normalized.match(/\b(?:para|pra)\s+(.+)$/)?.[1] ?? '';
  const canUseWholeTextForDate = /\b(?:muda|altera|remarca|reagenda|adia|passa|antecipa)\b/.test(normalized);
  const dateSource = destination || (canUseWholeTextForDate ? normalized : '');
  const date = dateSource ? resolveAgendaDate(dateSource, referenceDate) : null;
  const time = (temporalAnalysis ?? analyzeAgendaTime(text, { allowContextual: true })).time;
  const allDay = /\b(?:o\s+)?dia\s+inteiro\b/.test(normalized);
  const removesTime = /\b(?:sem\s+horario|remove(?:r)?\s+(?:o\s+)?horario|tira(?:r)?\s+(?:o\s+)?horario)\b/.test(normalized);

  return {
    ...(explicitTitle.title || implicitTitle.title
      ? { title: explicitTitle.title ?? implicitTitle.title }
      : {}),
    ...(date ? { date } : {}),
    ...(time ? { time, hasExplicitTime: true, allDay: false } : {}),
    ...(allDay ? { time: null, hasExplicitTime: false, allDay: true } : {}),
    ...(removesTime ? { time: null, hasExplicitTime: false, allDay: false } : {}),
  };
}

function extractEditTargetDate(text, referenceDate) {
  const normalized = normalizeFinancialText(text);
  const match = normalized.match(/\bde\s+(.+?)\s+(?:para|pra)\b/);
  return match ? resolveAgendaDate(match[1], referenceDate) : null;
}

function hasEditChanges(changes) {
  return Boolean(changes && Object.keys(changes).length > 0);
}

function hasExplicitEditChangeCue(text) {
  const normalized = normalizeFinancialText(text);
  return /\b(?:muda|mudar|altera|alterar|remarca|reagenda|adia|passa|antecipa|titulo|nome|data|horario|para|pra)\b/.test(normalized);
}

function formatItemLocalTime(item) {
  const date = new Date(item.starts_at);
  if (Number.isNaN(date.getTime())) return '00:00';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildAgendaItemChanges(item, fields) {
  const changes = {};
  if (fields.title) changes.title = fields.title;

  const changesTimeSemantics = fields.time !== undefined
    || fields.hasExplicitTime !== undefined
    || fields.allDay !== undefined;
  if (fields.date || changesTimeSemantics) {
    const date = fields.date ?? localIsoDate(new Date(item.starts_at));
    const isAllDay = fields.allDay ?? Boolean(item.is_all_day);
    const currentHasExplicitTime = !item.is_all_day && item.has_explicit_time !== false;
    const hasExplicitTime = !isAllDay && (fields.hasExplicitTime ?? currentHasExplicitTime);
    const time = fields.time ?? (hasExplicitTime ? formatItemLocalTime(item) : null);
    changes.starts_at = toStartIso(date, time, isAllDay);
    changes.is_all_day = isAllDay;
    changes.has_explicit_time = hasExplicitTime;
    if (!hasExplicitTime) changes.ends_at = null;

    const previousStart = new Date(item.starts_at).getTime();
    const previousEnd = new Date(item.ends_at).getTime();
    const nextStart = new Date(changes.starts_at).getTime();
    if (
      Number.isFinite(previousStart)
      && Number.isFinite(previousEnd)
      && previousEnd >= previousStart
      && Number.isFinite(nextStart)
    ) {
      if (hasExplicitTime) {
        changes.ends_at = new Date(nextStart + (previousEnd - previousStart)).toISOString();
      }
    }
  }

  return changes;
}

function toStartIso(date, time, allDay) {
  const parsed = parseIsoDate(date);
  if (!parsed) return null;
  const [hours, minutes] = (time ?? '00:00').split(':').map(Number);
  parsed.setHours(allDay ? 0 : hours, allDay ? 0 : minutes, 0, 0);
  return parsed.toISOString();
}

function applyDayPeriod(time, period) {
  const [rawHours, minutes] = time.split(':').map(Number);
  let hours = rawHours;
  if (period === 'manha' && hours === 12) hours = 0;
  if ((period === 'tarde' || period === 'noite') && hours < 12) hours += 12;
  if (period === 'noite' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function periodOnlyValue(normalized) {
  const match = normalized.match(
    /^(?:(?:da|de|pela|a)\s+(manha|tarde|noite))$/,
  );
  return match?.[1] ?? null;
}

function resolvePeriodOnlyReply(time, normalized) {
  const period = periodOnlyValue(normalized);
  return period ? applyDayPeriod(time, period) : null;
}

function clockLabel(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return minutes ? `${hours}:${String(minutes).padStart(2, '0')}` : String(hours);
}

function ambiguityPrompt(time) {
  const hours = Number(time.slice(0, 2));
  const label = clockLabel(time);
  if (hours === 12) return 'Você quer ao meio-dia ou à meia-noite?';
  const laterPeriod = hours <= 5 ? 'tarde' : 'noite';
  return `Você quer às ${label} da manhã ou às ${label} da ${laterPeriod}?`;
}

function configureAmbiguousTime(fields, time, referenceDate, currentDate) {
  fields.time = null;
  fields.hasExplicitTime = false;
  fields.timeChoiceResolved = false;
  fields.ambiguousTime = time;
  fields.suggestedTime = null;
  if (fields.date !== referenceDate) return ambiguityPrompt(time);

  const firstCandidate = new Date(toStartIso(fields.date, time, false));
  if (Number.isNaN(firstCandidate.getTime()) || currentDate <= firstCandidate) {
    return ambiguityPrompt(time);
  }

  const laterPeriod = Number(time.slice(0, 2)) <= 5 ? 'tarde' : 'noite';
  const suggestedTime = applyDayPeriod(time, laterPeriod);
  const laterCandidate = new Date(toStartIso(fields.date, suggestedTime, false));
  const label = clockLabel(time);
  if (currentDate < laterCandidate) {
    fields.suggestedTime = suggestedTime;
    const [suggestedHours, suggestedMinutes] = suggestedTime.split(':').map(Number);
    const suggestedLabel = suggestedMinutes
      ? `${suggestedHours}:${String(suggestedMinutes).padStart(2, '0')}`
      : `${suggestedHours}h`;
    return `${label} da manhã já passou. Você quer hoje às ${suggestedLabel}?`;
  }
  return 'Essas opções de horário já passaram hoje. Qual outro horário você prefere?';
}

function isAffirmativeReply(normalized) {
  return /^(?:sim|isso|pode\s+ser|beleza|certo|confirmo)[.!]?$/.test(normalized);
}

function dateBounds(date) {
  const parsed = parseIsoDate(date);
  if (!parsed) return null;
  const start = new Date(parsed);
  start.setHours(0, 0, 0, 0);
  const end = new Date(parsed);
  end.setHours(23, 59, 59, 999);
  return { startsFrom: start.toISOString(), startsTo: end.toISOString() };
}

function queryBounds(text, referenceDate) {
  const normalized = normalizeFinancialText(text);
  if (/\b(?:esta|essa)\s+semana\b/.test(normalized)) {
    const start = parseIsoDate(referenceDate);
    const end = new Date(start);
    end.setDate(end.getDate() + (7 - end.getDay()) % 7);
    const bounds = dateBounds(localIsoDate(start));
    bounds.startsTo = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).toISOString();
    return bounds;
  }
  const date = resolveAgendaDate(text, referenceDate);
  return date ? dateBounds(date) : null;
}

function normalizeIdentity(value) {
  return normalizeFinancialText(value ?? '')
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesTitle(item, subject) {
  const candidate = normalizeIdentity(`${item.title ?? ''} ${item.description ?? ''}`);
  const expected = normalizeIdentity(subject);
  return expected && candidate.includes(expected);
}

function selectUniqueCandidate(items, text) {
  const normalized = normalizeIdentity(text);
  const ordinalMatch = normalized.match(/\b(?:opcao\s+)?(1|2|3|primeir[oa]|segund[oa]|terceir[oa])\b/);
  if (ordinalMatch) {
    const ordinal = {
      1: 0, 2: 1, 3: 2,
      primeiro: 0, primeira: 0,
      segundo: 1, segunda: 1,
      terceiro: 2, terceira: 2,
    }[ordinalMatch[1]];
    return items[ordinal] ?? null;
  }

  const exact = items.filter((item) => (
    normalizeIdentity(item.title) === normalized
    || normalizeIdentity(item.description) === normalized
  ));
  if (exact.length === 1) return exact[0];

  const selectedTime = extractAgendaTime(text, { allowContextual: true });
  if (selectedTime) {
    const byTime = items.filter((item) => {
      if (item.is_all_day) return false;
      return formatItemLocalTime(item) === selectedTime;
    });
    if (byTime.length === 1) return byTime[0];
  }

  const partial = items.filter((item) => matchesTitle(item, text));
  return partial.length === 1 ? partial[0] : null;
}

function formatDateTime(item) {
  const date = new Date(item.starts_at);
  if (Number.isNaN(date.getTime())) return item.title;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
  if (item.is_all_day) return `${item.title}, dia ${dateLabel}, dia inteiro`;
  if (item.has_explicit_time === false) return `${item.title}, dia ${dateLabel}, sem horário`;
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${item.title}, dia ${dateLabel} às ${time}`;
}

function successText(action, item) {
  if (action === 'complete') return `Pronto. Marquei ${item.title} como concluído.`;
  if (action === 'edit') return `Pronto. Atualizei ${formatDateTime(item)}.`;
  if (action === 'cancel') return `Tudo certo. Cancelei ${item.title}.`;
  if (action === 'delete') return `Tudo certo. Excluí ${item.title} da sua agenda.`;
  return item.is_all_day
    ? `Pronto. Coloquei ${item.title} na sua agenda como compromisso do dia.`
    : `Pronto. Coloquei ${formatDateTime(item)} na sua agenda.`;
}

function serviceErrorText(error) {
  if (error?.code === 'AGENDA_OPERATION_STORAGE_UNAVAILABLE') {
    return 'Não consegui proteger esta criação para tentativas seguras. Verifique o armazenamento do navegador e tente novamente.';
  }
  if (error?.code === 'AGENDA_OPERATION_PAYLOAD_CONFLICT') {
    return 'A criação pendente tem dados diferentes. Cancele essa operação e inicie uma nova.';
  }
  if (error?.code === 'AGENDA_ITEM_IDEMPOTENCY_CONFLICT') {
    return 'Essa tentativa de criação conflita com outro compromisso. Revise os dados e tente novamente.';
  }
  if (error?.code === 'AGENDA_ITEM_CONFLICT') {
    return 'Esse compromisso mudou desde que você o consultou. Confira a Agenda e tente novamente.';
  }
  return 'Não consegui atualizar sua agenda agora. Tente novamente em instantes.';
}

function buildFinancialDraft(originalText) {
  const details = String(originalText ?? '')
    .replace(/\b(?:hoje|amanhã|amanha|depois\s+de\s+amanhã|depois\s+de\s+amanha)\b/giu, '')
    .replace(/\b(?:eu\s+)?(?:tenho\s+que|preciso|vou)\s+pagar\b/giu, '')
    .replace(/^[\s,.;:]+|[\s,;:]+$/g, '')
    .trim();
  return `Registre uma despesa: ${details || originalText}`;
}

export function createAgendaConversationFlow({
  services = defaultServices,
  createOperationId = createAgendaClientOperationId,
  idempotencyEnabled = AGENDA_IDEMPOTENCY_ENABLED,
  operationStorage,
  now = () => new Date(),
  operationStore = {
    getOrCreate: getOrCreateAgendaOperation,
    clear: clearAgendaOperation,
  },
} = {}) {
  const stacks = new Map();
  let actionSequence = 0;

  function identityKey(identity) {
    return `${identity.userId}:${identity.workspaceId}:${identity.conversationId}`;
  }

  function getStack(identity) {
    return stacks.get(identityKey(identity)) ?? null;
  }

  function setStack(identity, stack) {
    if (stack.actions.length) stacks.set(identityKey(identity), stack);
    else stacks.delete(identityKey(identity));
  }

  function operationScope(identity) {
    return {
      userId: identity.userId,
      workspaceId: identity.workspaceId,
      origin: `uni:${identity.conversationId}`,
    };
  }

  function creationIntent(fields) {
    return {
      itemType: fields.itemType ?? 'appointment',
      title: fields.title ?? null,
      description: fields.description ?? null,
      date: fields.date ?? null,
      time: fields.time ?? null,
      allDay: Boolean(fields.allDay),
      hasExplicitTime: Boolean(fields.hasExplicitTime),
    };
  }

  async function clearCreationOperation(identity, clientOperationId) {
    if (!idempotencyEnabled || !clientOperationId) return false;
    return operationStore.clear({
      ...operationScope(identity),
      clientOperationId,
      storage: operationStorage,
    });
  }

  async function supersedePending(identity, active) {
    if (active?.type === PENDING_TYPES.CREATE) {
      await clearCreationOperation(identity, active.fields.clientOperationId);
    }
    const stack = getStack(identity);
    if (!stack || !active) return;
    const transition = cancelPendingAction(stack, active.id, { cascade: true });
    setStack(identity, transition.stack);
  }

  function shouldSupersedePending(active, classification, text, referenceDate) {
    if (!active || !AGENDA_INTENTS.has(classification.intent)) return false;
    if (classification.intent === 'agenda_no_time' || active.type === PENDING_TYPES.FINANCIAL_CONFLICT) {
      return false;
    }
    if (active.type === PENDING_TYPES.CREATE) {
      if (!['agenda_reminder_create', 'agenda_schedule_create'].includes(classification.intent)) return true;
      const candidateTitle = extractTitle(text);
      const candidateDate = resolveAgendaDate(text, referenceDate);
      return Boolean(
        (candidateTitle && active.fields.title && candidateTitle !== active.fields.title)
        || (candidateDate && active.fields.date && candidateDate !== active.fields.date),
      );
    }
    if (active.type === PENDING_TYPES.EDIT) {
      return ['agenda_reminder_create', 'agenda_schedule_create', 'agenda_query'].includes(classification.intent);
    }
    return false;
  }

  async function startPending(identity, type, fields) {
    const base = getStack(identity) ?? createPendingActionStack(identity);
    let pendingFields = fields;
    if (idempotencyEnabled && type === PENDING_TYPES.CREATE && !fields.clientOperationId) {
      const operation = await operationStore.getOrCreate({
        ...operationScope(identity),
        intent: creationIntent(fields),
        createOperationId,
        storage: operationStorage,
      });
      pendingFields = { ...fields, clientOperationId: operation.clientOperationId };
    }
    const transition = pushPendingAction(base, {
      id: `agenda-${type}-${++actionSequence}`,
      type,
      deduplicationKey: `${type}:${normalizeIdentity(JSON.stringify(fields))}`,
      fields: pendingFields,
    });
    setStack(identity, transition.stack);
    return transition.activeAction;
  }

  function finishPending(identity, active, result) {
    const transition = completePendingAction(getStack(identity), active.id, result);
    setStack(identity, transition.stack);
  }

  async function createItem(identity, fields) {
    const operation = idempotencyEnabled
      ? await operationStore.getOrCreate({
        ...operationScope(identity),
        intent: creationIntent(fields),
        preferredOperationId: fields.clientOperationId,
        createOperationId,
        storage: operationStorage,
      })
      : null;

    const result = await services.createAgendaItem(identity.workspaceId, {
      item_type: fields.itemType ?? 'appointment',
      title: fields.title,
      ...(fields.description ? { description: fields.description } : {}),
      starts_at: toStartIso(fields.date, fields.time, fields.allDay),
      ends_at: null,
      is_all_day: Boolean(fields.allDay),
      has_explicit_time: !fields.allDay && Boolean(fields.hasExplicitTime),
      ...(operation ? { client_operation_id: operation.clientOperationId } : {}),
    }, { idempotencyEnabled });
    if (
      operation
      && (!result.error || result.error.code === 'AGENDA_ITEM_IDEMPOTENCY_CONFLICT')
    ) {
      await clearCreationOperation(identity, operation.clientOperationId);
    }
    return result;
  }

  async function findCandidates(identity, { subject, date }) {
    const result = await services.listAgendaItems(identity.workspaceId, {
      ...(date ? dateBounds(date) : {}),
      status: 'scheduled',
    });
    if (result.error) return result;
    return {
      ...result,
      data: (result.data ?? []).filter((item) => !subject || matchesTitle(item, subject)),
    };
  }

  async function executeSelected(identity, action, item, fields = {}) {
    if (action === 'edit') {
      const changes = buildAgendaItemChanges(item, fields);
      if (Object.keys(changes).length === 0) {
        return {
          handled: true,
          text: `O que você quer alterar em ${item.title}: título, data ou horário?`,
          needsEditDetails: true,
        };
      }
      const result = await services.updateAgendaItem(
        identity.workspaceId,
        item.id,
        changes,
        { expectedUpdatedAt: item.updated_at },
      );
      return result.error
        ? { handled: true, text: serviceErrorText(result.error) }
        : { handled: true, text: successText(action, result.data) };
    }
    if (action === 'delete') {
      const result = await services.deleteAgendaItem(
        identity.workspaceId,
        item.id,
        { expectedUpdatedAt: item.updated_at },
      );
      return result.error
        ? { handled: true, text: serviceErrorText(result.error) }
        : { handled: true, text: successText(action, item) };
    }
    const status = action === 'complete' ? 'completed' : 'cancelled';
    const result = await services.setAgendaItemStatus(
      identity.workspaceId,
      item.id,
      status,
      { expectedUpdatedAt: item.updated_at },
    );
    return result.error
      ? { handled: true, text: serviceErrorText(result.error) }
      : { handled: true, text: successText(action, result.data) };
  }

  async function handlePending(text, identity, referenceDate) {
    const stack = getStack(identity);
    const active = stack ? getActivePendingAction(stack) : null;
    if (!active) return null;
    const normalized = normalizeFinancialText(text);

    if (/^(?:cancela|cancelar|deixa|deixa pra la|nao quero)[.!]?$/.test(normalized)) {
      if (active.type === PENDING_TYPES.CREATE) {
        await clearCreationOperation(identity, active.fields.clientOperationId);
      }
      const transition = cancelPendingAction(stack, active.id, { cascade: true });
      setStack(identity, transition.stack);
      return { handled: true, text: 'Tudo bem. Não alterei sua agenda.' };
    }

    if (active.type === PENDING_TYPES.CREATE) {
      const fields = { ...active.fields };
      let timeAnalysis = analyzeAgendaTime(text, { allowContextual: true });
      const normalizedTimeReply = normalizeTimeReply(text);
      const periodResolvedTime = fields.ambiguousTime
        ? resolvePeriodOnlyReply(fields.ambiguousTime, normalizedTimeReply)
        : null;
      const confirmedSuggestedTime = fields.suggestedTime && isAffirmativeReply(normalized)
        ? fields.suggestedTime
        : null;
      if (periodResolvedTime || confirmedSuggestedTime) {
        timeAnalysis = {
          time: periodResolvedTime ?? confirmedSuggestedTime,
          invalid: false,
          invalidCandidate: null,
          ambiguousPeriod: false,
        };
      }
      const content = extractAgendaContent(text, timeAnalysis);
      if (!fields.title) fields.title = content.title;
      if (!fields.description && content.description) fields.description = content.description;
      const noTime = /\b(?:sem\s+horario|pode\s+deixar\s+sem\s+horario)\b/.test(normalized);
      const allDay = /\b(?:compromisso\s+do\s+dia|(?:o\s+)?dia\s+inteiro)\b/.test(normalized);
      let ambiguityQuestion = null;
      if (allDay) {
        fields.allDay = true;
        fields.hasExplicitTime = false;
        fields.timeChoiceResolved = true;
        fields.time = null;
        fields.ambiguousTime = null;
        fields.suggestedTime = null;
      } else if (noTime) {
        fields.allDay = false;
        fields.hasExplicitTime = false;
        fields.timeChoiceResolved = true;
        fields.time = null;
        fields.ambiguousTime = null;
        fields.suggestedTime = null;
      } else if (timeAnalysis.time) {
        if (timeAnalysis.ambiguousPeriod) {
          ambiguityQuestion = configureAmbiguousTime(fields, timeAnalysis.time, referenceDate, now());
        } else {
          fields.time = timeAnalysis.time;
          fields.allDay = false;
          fields.hasExplicitTime = true;
          fields.timeChoiceResolved = true;
          fields.repairField = null;
          fields.ambiguousTime = null;
          fields.suggestedTime = null;
        }
      }
      if (!fields.date) fields.date = resolveAgendaDate(text, referenceDate);

      if (timeAnalysis.blocked) {
        fields.time = null;
        fields.hasExplicitTime = false;
        fields.timeChoiceResolved = false;
        fields.ambiguousTime = null;
        fields.suggestedTime = null;
      }

      const updated = updatePendingAction(stack, active.id, { fields });
      setStack(identity, updated.stack);
      if (timeAnalysis.invalid) {
        const repair = updatePendingAction(updated.stack, updated.action.id, {
          fields: { ...fields, repairField: 'time' },
        });
        setStack(identity, repair.stack);
        return { handled: true, text: INVALID_TIME_CORRECTION_TEXT };
      }
      if (!fields.title) return { handled: true, text: 'Claro. O que você quer que eu coloque na agenda?' };
      if (!fields.date) return { handled: true, text: `Em qual dia você quer marcar ${fields.title}?` };
      if (ambiguityQuestion) return { handled: true, text: ambiguityQuestion };
      if (!fields.timeChoiceResolved) {
        if (fields.ambiguousTime) return { handled: true, text: ambiguityPrompt(fields.ambiguousTime) };
        return { handled: true, text: 'Quer colocar um horário ou deixo como compromisso do dia?' };
      }

      const result = await createItem(identity, fields);
      if (result.error) return { handled: true, text: serviceErrorText(result.error) };
      finishPending(identity, { ...active, id: updated.action.id }, result.data);
      return { handled: true, text: successText('create', result.data) };
    }

    if (active.type === PENDING_TYPES.FINANCIAL_CONFLICT) {
      if (/\b(?:lembrete|agenda|lembrar|me avisa)\b/.test(normalized)) {
        const fields = {
          title: active.fields.title,
          date: active.fields.date,
          time: null,
          allDay: false,
          itemType: 'reminder',
        };
        finishPending(identity, active, { choice: 'agenda' });
        await startPending(identity, PENDING_TYPES.CREATE, fields);
        return { handled: true, text: 'Quer colocar um horário ou deixo como compromisso do dia?' };
      }
      if (/\b(?:financeir[ao]|operacao|lancamento|despesa|gasto)\b/.test(normalized)) {
        finishPending(identity, active, { choice: 'financial' });
        return {
          handled: true,
          route: 'financial',
          financialText: buildFinancialDraft(active.fields.originalText),
          text: '',
        };
      }
      return {
        handled: true,
        text: 'Você quer criar um lembrete na Agenda ou tratar isso como uma operação financeira?',
      };
    }

    if (active.type === PENDING_TYPES.EDIT) {
      const timeAnalysis = analyzeAgendaTime(text, { allowContextual: true });
      if (timeAnalysis.invalid) return { handled: true, text: INVALID_TIME_CORRECTION_TEXT };
      let item = active.fields.item ?? null;
      let items = active.fields.items ?? null;
      let changes = { ...(active.fields.changes ?? {}) };

      if (!item && items?.length) {
        item = selectUniqueCandidate(items, text);
        if (!item) {
          return {
            handled: true,
            text: `Ainda há mais de uma opção. Qual delas você quer? ${items.map(formatDateTime).join('; ')}.`,
          };
        }
      }

      if (!item) {
        const subject = extractEditTargetSubject(text);
        if (!subject) {
          return {
            handled: true,
            text: 'Qual compromisso você quer editar e qual alteração deseja fazer no título, data ou horário?',
          };
        }
        const candidates = await findCandidates(identity, {
          subject,
          date: extractEditTargetDate(text, referenceDate),
        });
        if (candidates.error) return { handled: true, text: serviceErrorText(candidates.error) };
        if (!candidates.data.length) {
          return { handled: true, text: 'Não encontrei esse compromisso. Qual item da Agenda você quer editar?' };
        }
        if (candidates.data.length > 1) {
          const updated = updatePendingAction(stack, active.id, {
            fields: { ...active.fields, items: candidates.data, changes },
          });
          setStack(identity, updated.stack);
          return {
            handled: true,
            text: `Encontrei mais de um. Qual deles você quer? ${candidates.data.map(formatDateTime).join('; ')}.`,
          };
        }
        [item] = candidates.data;
      }

      if (hasExplicitEditChangeCue(text)) {
        changes = {
          ...changes,
          ...extractEditChanges(text, referenceDate, timeAnalysis),
        };
      }
      if (!hasEditChanges(changes)) {
        const updated = updatePendingAction(stack, active.id, {
          fields: { ...active.fields, item, items: null, changes },
        });
        setStack(identity, updated.stack);
        return {
          handled: true,
          text: `O que você quer alterar em ${item.title}: título, data ou horário?`,
        };
      }

      const result = await executeSelected(identity, 'edit', item, changes);
      finishPending(identity, active, result);
      return result;
    }

    if (active.type === PENDING_TYPES.CANCEL) {
      if (/^(?:nao|não)[.!]?$/.test(normalized)) {
        const transition = cancelPendingAction(stack, active.id, { cascade: true });
        setStack(identity, transition.stack);
        return { handled: true, text: 'Tudo bem. Mantive o compromisso na sua agenda.' };
      }
      if (/^(?:sim|confirmo|pode|pode cancelar|confirmar)[.!]?$/.test(normalized)) {
        const result = await executeSelected(identity, active.fields.action, active.fields.item);
        finishPending(identity, active, result);
        return result;
      }
      return { handled: true, text: `Quer mesmo cancelar ${active.fields.item.title}? Responda “sim” ou “não”.` };
    }

    if (active.type === PENDING_TYPES.DISAMBIGUATE) {
      const selected = selectUniqueCandidate(active.fields.items, text);
      if (!selected) {
        return {
          handled: true,
          text: `Qual deles você quer? ${active.fields.items.map(formatDateTime).join('; ')}.`,
        };
      }
      finishPending(identity, active, selected);
      if (['cancel', 'delete'].includes(active.fields.action)) {
        await startPending(identity, PENDING_TYPES.CANCEL, {
          action: active.fields.action,
          item: selected,
        });
        return {
          handled: true,
          text: active.fields.action === 'delete'
            ? `Quer mesmo excluir ${selected.title} da sua agenda?`
            : `Quer mesmo cancelar ${selected.title}?`,
        };
      }
      return executeSelected(identity, active.fields.action, selected, active.fields.changes);
    }

    return null;
  }

  async function handleInternal({ text, identity, referenceDate }) {
    if (!identity?.userId || !identity?.workspaceId || !identity?.conversationId) {
      return { handled: true, text: 'Não consegui identificar seu espaço atual. Atualize a página e tente novamente.' };
    }

    const agendaText = stripUniVocative(text);
    const classification = classifyIntent(agendaText);
    const currentStack = getStack(identity);
    const currentPending = currentStack ? getActivePendingAction(currentStack) : null;
    if (shouldSupersedePending(currentPending, classification, agendaText, referenceDate)) {
      await supersedePending(identity, currentPending);
    }
    const pendingResult = await handlePending(agendaText, identity, referenceDate);
    if (pendingResult) return pendingResult;

    if (!AGENDA_INTENTS.has(classification.intent)) return { handled: false };
    if (classification.intent === 'agenda_no_time') {
      return { handled: true, text: 'Essa resposta precisa estar ligada a um compromisso que ainda estou montando.' };
    }

    if (classification.intent === 'agenda_financial_conflict') {
      const fields = {
        originalText: agendaText,
        title: extractTitle(agendaText),
        date: resolveAgendaDate(agendaText, referenceDate),
      };
      await startPending(identity, PENDING_TYPES.FINANCIAL_CONFLICT, fields);
      return {
        handled: true,
        text: 'Isso é um lembrete para pagar na data informada ou você quer tratar como uma operação financeira?',
      };
    }

    if (['agenda_reminder_create', 'agenda_schedule_create'].includes(classification.intent)) {
      const timeAnalysis = analyzeAgendaTime(agendaText, { allowContextual: true });
      const content = extractAgendaContent(agendaText, timeAnalysis);
      const fields = {
        intent: classification.intent,
        title: classification.signals.includes('agenda_vague_subject') ? null : content.title,
        description: content.description,
        date: resolveAgendaDate(agendaText, referenceDate),
        time: timeAnalysis.time,
        allDay: /\b(?:o\s+)?dia\s+inteiro\b/.test(normalizeFinancialText(agendaText)),
        hasExplicitTime: Boolean(timeAnalysis.time),
        timeChoiceResolved: Boolean(timeAnalysis.time)
          || /\b(?:(?:o\s+)?dia\s+inteiro|sem\s+horario)\b/.test(normalizeFinancialText(agendaText)),
        itemType: classification.intent === 'agenda_reminder_create' ? 'reminder' : 'appointment',
      };
      if (fields.allDay) {
        fields.time = null;
        fields.hasExplicitTime = false;
      }
      const ambiguityQuestion = timeAnalysis.ambiguousPeriod
        ? configureAmbiguousTime(fields, timeAnalysis.time, referenceDate, now())
        : null;
      if (!fields.title || !fields.date || !fields.timeChoiceResolved) {
        if (timeAnalysis.invalid) fields.repairField = 'time';
        await startPending(identity, PENDING_TYPES.CREATE, fields);
        if (timeAnalysis.invalid) return { handled: true, text: INVALID_TIME_CORRECTION_TEXT };
        if (!fields.title) return { handled: true, text: 'Claro. O que você quer que eu coloque na agenda?' };
        if (!fields.date) return { handled: true, text: `Em qual dia você quer marcar ${fields.title}?` };
        if (ambiguityQuestion) return { handled: true, text: ambiguityQuestion };
        return { handled: true, text: 'Quer colocar um horário ou deixo como compromisso do dia?' };
      }
      const result = await createItem(identity, fields);
      return result.error
        ? { handled: true, text: serviceErrorText(result.error) }
        : { handled: true, text: successText('create', result.data) };
    }

    if (classification.intent === 'agenda_query') {
      const bounds = queryBounds(agendaText, referenceDate);
      const result = await services.listAgendaItems(identity.workspaceId, {
        ...(bounds ?? {}),
        status: 'scheduled',
      });
      if (result.error) return { handled: true, text: serviceErrorText(result.error) };
      if (!result.data?.length) return { handled: true, text: 'Você não tem compromissos nesse período.' };
      return { handled: true, text: `Você tem: ${result.data.map(formatDateTime).join('; ')}.` };
    }

    const normalizedText = normalizeFinancialText(agendaText);
    const action = classification.intent === 'agenda_edit'
      ? 'edit'
      : classification.intent === 'agenda_complete'
        ? 'complete'
        : /\b(?:excluir|exclui|remover|remove)\b/.test(normalizedText)
          ? 'delete'
          : 'cancel';
    if (action === 'edit') {
      const timeAnalysis = analyzeAgendaTime(agendaText, { allowContextual: true });
      if (timeAnalysis.invalid) return { handled: true, text: INVALID_TIME_CORRECTION_TEXT };
      const subject = extractEditTargetSubject(agendaText);
      const changes = extractEditChanges(agendaText, referenceDate, timeAnalysis);
      if (!subject) {
        await startPending(identity, PENDING_TYPES.EDIT, {
          item: null,
          items: null,
          changes,
        });
        return {
          handled: true,
          text: 'Qual compromisso você quer editar e qual alteração deseja fazer no título, data ou horário?',
        };
      }

      const candidates = await findCandidates(identity, {
        subject,
        date: extractEditTargetDate(agendaText, referenceDate),
      });
      if (candidates.error) return { handled: true, text: serviceErrorText(candidates.error) };
      if (!candidates.data.length) return { handled: true, text: 'Não encontrei esse compromisso na sua agenda.' };
      if (candidates.data.length > 1) {
        await startPending(identity, PENDING_TYPES.EDIT, {
          item: null,
          items: candidates.data,
          changes,
        });
        return {
          handled: true,
          text: `Encontrei mais de um. Qual deles você quer? ${candidates.data.map(formatDateTime).join('; ')}.`,
        };
      }
      if (!hasEditChanges(changes)) {
        await startPending(identity, PENDING_TYPES.EDIT, {
          item: candidates.data[0],
          items: null,
          changes,
        });
        return {
          handled: true,
          text: `O que você quer alterar em ${candidates.data[0].title}: título, data ou horário?`,
        };
      }
      return executeSelected(identity, action, candidates.data[0], changes);
    }

    const subject = extractTitle(agendaText);
    const date = resolveAgendaDate(agendaText, referenceDate);
    const candidates = await findCandidates(identity, { subject, date });
    if (candidates.error) return { handled: true, text: serviceErrorText(candidates.error) };
    if (!candidates.data.length) return { handled: true, text: 'Não encontrei esse compromisso na sua agenda.' };
    if (candidates.data.length > 1) {
      await startPending(identity, PENDING_TYPES.DISAMBIGUATE, {
        action,
        items: candidates.data,
      });
      return { handled: true, text: `Encontrei mais de um. Qual deles você quer? ${candidates.data.map(formatDateTime).join('; ')}.` };
    }
    if (['cancel', 'delete'].includes(action)) {
      await startPending(identity, PENDING_TYPES.CANCEL, { action, item: candidates.data[0] });
      return {
        handled: true,
        text: action === 'delete'
          ? `Quer mesmo excluir ${candidates.data[0].title} da sua agenda?`
          : `Quer mesmo cancelar ${candidates.data[0].title}?`,
      };
    }
    return executeSelected(identity, action, candidates.data[0]);
  }

  return Object.freeze({
    async handle(args) {
      try {
        return await handleInternal(args);
      } catch (error) {
        if (
          error?.code === 'AGENDA_OPERATION_STORAGE_UNAVAILABLE'
          || error?.code === 'AGENDA_OPERATION_PAYLOAD_CONFLICT'
          || error?.code === 'AGENDA_OPERATION_SCOPE_REQUIRED'
        ) {
          return { handled: true, text: serviceErrorText(error), error };
        }
        throw error;
      }
    },
    async abandonPending(identity) {
      if (!identity?.userId || !identity?.workspaceId || !identity?.conversationId) return false;
      const key = identityKey(identity);
      const stack = stacks.get(key);
      if (!stack) return false;
      const active = getActivePendingAction(stack);
      const transition = active
        ? cancelPendingAction(stack, active.id, { cascade: true })
        : { stack: { ...stack, actions: [] } };
      setStack(identity, transition.stack);
      if (active?.type === PENDING_TYPES.CREATE) {
        await clearCreationOperation(identity, active.fields.clientOperationId);
      }
      return true;
    },
    hasPending(identity) {
      return Boolean(identity?.userId && identity?.workspaceId && identity?.conversationId && getStack(identity));
    },
  });
}
