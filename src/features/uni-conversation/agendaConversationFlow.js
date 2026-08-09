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
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezassete: 17, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
});

const SPOKEN_HOUR_PATTERN = [
  'vinte(?:\\s+e\\s+(?:uma|duas|tres))?',
  'uma', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quatorze', 'quinze',
  'dezesseis', 'dezassete', 'dezessete', 'dezoito', 'dezenove',
].join('|');
const AGENDA_DATE_CONTEXT_PATTERN = [
  'hoje',
  'amanha',
  'depois\\s+de\\s+amanha',
  '(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?(?:\\s+que\\s+vem)?',
  'dia\\s+\\d{1,2}',
  '\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?',
].join('|');
const SPOKEN_TIME_WITH_CUE = new RegExp(
  `\\b(?:as|das|para)\\s+(${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?\\b`,
);
const SPOKEN_TIME_WITH_HOURS = new RegExp(
  `^(${SPOKEN_HOUR_PATTERN})\\s+horas?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?$`,
);
const CONTEXTUAL_NUMERIC_TIME = new RegExp(
  `\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(\\d{1,2})(?:[:h](\\d{2}))?\\s*(?:horas?|h)?\\b`,
);
const CONTEXTUAL_NUMERIC_TIME_WITH_PERIOD = new RegExp(
  `\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(\\d{1,2})(?:[:h](\\d{2}))?\\s*(?:horas?|h)?\\s+(da\\s+manha|da\\s+tarde|da\\s+noite)\\b`,
);
const CONTEXTUAL_SPOKEN_TIME = new RegExp(
  `\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\s+(${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?(?:\\s+(da\\s+manha|da\\s+tarde|da\\s+noite))?\\b`,
);
const SPOKEN_TIME_WITH_PERIOD = new RegExp(
  `\\b(${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?\\s+(da\\s+manha|da\\s+tarde|da\\s+noite)\\b`,
);
const SPOKEN_TIME_TITLE = new RegExp(
  `\\b(?:as|das|para)\\s+(?:${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?(?:\\s+da\\s+(?:manha|tarde|noite))?\\b`,
  'g',
);
const CONTEXTUAL_TIME_TITLE = new RegExp(
  `(\\b(?:${AGENDA_DATE_CONTEXT_PATTERN})\\b)\\s+(?:(?:\\d{1,2})(?:[:h]\\d{2})?\\s*(?:horas?|h)?|(?:${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?)(?:\\s+da\\s+(?:manha|tarde|noite))?\\b`,
  'g',
);
const SPOKEN_PERIOD_TIME_TITLE = new RegExp(
  `\\b(?:${SPOKEN_HOUR_PATTERN})(?:\\s+horas?)?\\s+da\\s+(?:manha|tarde|noite)\\b`,
  'g',
);
const NUMERIC_PERIOD_TIME_TITLE = /\b\d{1,2}(?:[:h]\d{2})?\s*(?:horas?|h)?\s+da\s+(?:manha|tarde|noite)\b/g;

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
  if (NUMBER_WORDS[normalized]) return NUMBER_WORDS[normalized];
  const compound = normalized.match(/^(vinte|trinta)\s+e\s+(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)$/);
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

export function extractAgendaTime(text, { allowContextual = false } = {}) {
  const normalized = normalizeFinancialText(text);
  const numericWithPeriod = normalized.match(
    /\b(?:as|das|para)\s+(\d{1,2})(?:[:h](\d{2}))?\s*(?:horas?|h)?\s+(da\s+manha|da\s+tarde|da\s+noite)\b/,
  );
  if (numericWithPeriod) {
    return formatExtractedTime(numericWithPeriod[1], numericWithPeriod[2], numericWithPeriod[3]);
  }

  const numeric = normalized.match(
    /\b(?:as|das|para)\s+(\d{1,2})(?:[:h](\d{2}))?\s*(?:horas?|h)?\b/,
  ) ?? normalized.match(/^(\d{1,2})(?:[:h](\d{2}))?\s*(?:horas?|h)?$/);
  if (numeric) return formatExtractedTime(numeric[1], numeric[2]);

  const spoken = normalized.match(SPOKEN_TIME_WITH_CUE)
    ?? normalized.match(SPOKEN_TIME_WITH_HOURS);
  if (spoken) return formatExtractedTime(parseCount(spoken[1]), 0, spoken[2]);

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

function extractTitle(text) {
  const normalized = normalizeFinancialText(text)
    .replace(/\b(?:me\s+)?lembra(?:r)?\s+(?:de|da|do)?\s*/g, '')
    .replace(/\b(?:eu\s+)?tenho\s+que\s+/g, '')
    .replace(/\b(?:eu\s+)?tenho\s+(?:uma|um)?\s*/g, '')
    .replace(/\b(?:bota|anota|marca|agende|agenda|cria)\s+(?:ai\s+)?(?:na\s+agenda\s+)?/g, '')
    .replace(/\b(?:muda|remarca|reagenda|adia|antecipa)\s+(?:meu|minha|o|a)?\s*/g, '')
    .replace(/\b(?:cancela|cancelar|desmarca|desmarcar|exclui|excluir)\s+(?:meu|minha|o|a)?\s*/g, '')
    .replace(/\b(?:ja\s+fiz|conclui|finalizei)\s+(?:aquele|aquela|o|a)?\s*/g, '')
    .replace(/\b(?:pode\s+)?marcar\s+como\s+concluida?\b/g, '')
    .replace(/\bdaqui\s+(?:a\s+|uns?\s+|umas?\s+|cerca\s+de\s+)?[\w\s]+?\s+(?:dias?|semanas?)\b/g, '')
    .replace(CONTEXTUAL_TIME_TITLE, '$1')
    .replace(/\b(?:hoje|amanha|depois\s+de\s+amanha|fim\s+do\s+mes|final\s+do\s+mes)\b/g, '')
    .replace(/\b(?:(?:de|na|no|para|pra)\s+)?(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?(?:\s+que\s+vem)?\b/g, '')
    .replace(/\b(?:(?:de|na|no|para|pra)\s+)?dia\s+\d{1,2}\b/g, '')
    .replace(/\b(?:as|das|para)\s+\d{1,2}(?:[:h]\d{2})?\s*(?:horas?|h)?(?:\s+da\s+(?:manha|tarde|noite))?\b/g, '')
    .replace(SPOKEN_TIME_TITLE, '')
    .replace(SPOKEN_PERIOD_TIME_TITLE, '')
    .replace(NUMERIC_PERIOD_TIME_TITLE, '')
    .replace(/\b(?:aquele|aquela)\s+(?:coisa|negocio|compromisso)\b/g, '')
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:de|da|do|para|na|no)\s*$/g, '')
    .trim();
  return normalized || null;
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

function extractEditChanges(text, referenceDate) {
  const normalized = normalizeFinancialText(text);
  const explicitTitle = extractExplicitTitleChange(text);
  const implicitTitle = extractImplicitTitleChange(text);
  const destination = normalized.match(/\b(?:para|pra)\s+(.+)$/)?.[1] ?? '';
  const canUseWholeTextForDate = /\b(?:muda|altera|remarca|reagenda|adia|passa|antecipa)\b/.test(normalized);
  const dateSource = destination || (canUseWholeTextForDate ? normalized : '');
  const date = dateSource ? resolveAgendaDate(dateSource, referenceDate) : null;
  const time = extractAgendaTime(text, { allowContextual: true });

  return {
    ...(explicitTitle.title || implicitTitle.title
      ? { title: explicitTitle.title ?? implicitTitle.title }
      : {}),
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
  };
}

function extractEditTargetDate(text, referenceDate) {
  const normalized = normalizeFinancialText(text);
  const match = normalized.match(/\bde\s+(.+?)\s+(?:para|pra)\b/);
  return match ? resolveAgendaDate(match[1], referenceDate) : null;
}

function hasEditChanges(changes) {
  return Boolean(changes?.title || changes?.date || changes?.time);
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

  if (fields.date || fields.time) {
    const date = fields.date ?? localIsoDate(new Date(item.starts_at));
    const isAllDay = fields.time ? false : Boolean(item.is_all_day);
    const time = fields.time ?? (isAllDay ? null : formatItemLocalTime(item));
    changes.starts_at = toStartIso(date, time, isAllDay);
    if (fields.time) changes.is_all_day = false;

    const previousStart = new Date(item.starts_at).getTime();
    const previousEnd = new Date(item.ends_at).getTime();
    const nextStart = new Date(changes.starts_at).getTime();
    if (
      Number.isFinite(previousStart)
      && Number.isFinite(previousEnd)
      && previousEnd >= previousStart
      && Number.isFinite(nextStart)
    ) {
      changes.ends_at = new Date(nextStart + (previousEnd - previousStart)).toISOString();
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
  if (item.is_all_day) return `${item.title}, dia ${dateLabel}`;
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
      date: fields.date ?? null,
      time: fields.time ?? null,
      allDay: Boolean(fields.allDay),
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
      starts_at: toStartIso(fields.date, fields.time, fields.allDay),
      ends_at: null,
      is_all_day: Boolean(fields.allDay),
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
      const result = await services.deleteAgendaItem(identity.workspaceId, item.id);
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
      if (!fields.title) fields.title = extractTitle(text);
      const noTime = /\b(?:sem\s+horario|pode\s+deixar\s+sem\s+horario|compromisso\s+do\s+dia|dia\s+inteiro)\b/.test(normalized);
      const time = extractAgendaTime(text, { allowContextual: true });
      if (noTime) {
        fields.allDay = true;
        fields.time = null;
      } else if (time) {
        fields.time = time;
        fields.allDay = false;
      }
      if (!fields.date) fields.date = resolveAgendaDate(text, referenceDate);

      const updated = updatePendingAction(stack, active.id, { fields });
      setStack(identity, updated.stack);
      if (!fields.title) return { handled: true, text: 'Claro. O que você quer que eu coloque na agenda?' };
      if (!fields.date) return { handled: true, text: `Em qual dia você quer marcar ${fields.title}?` };
      if (fields.time == null && !fields.allDay) {
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
        changes = { ...changes, ...extractEditChanges(text, referenceDate) };
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
    const pendingResult = await handlePending(agendaText, identity, referenceDate);
    if (pendingResult) return pendingResult;

    const classification = classifyIntent(agendaText);
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
      const fields = {
        title: classification.signals.includes('agenda_vague_subject') ? null : extractTitle(agendaText),
        date: resolveAgendaDate(agendaText, referenceDate),
        time: extractAgendaTime(agendaText, { allowContextual: true }),
        allDay: false,
        itemType: classification.intent === 'agenda_reminder_create' ? 'reminder' : 'appointment',
      };
      if (!fields.title || !fields.date || !fields.time) {
        await startPending(identity, PENDING_TYPES.CREATE, fields);
        if (!fields.title) return { handled: true, text: 'Claro. O que você quer que eu coloque na agenda?' };
        if (!fields.date) return { handled: true, text: `Em qual dia você quer marcar ${fields.title}?` };
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
      const subject = extractEditTargetSubject(agendaText);
      const changes = extractEditChanges(agendaText, referenceDate);
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
    abandonPending(identity) {
      if (!identity?.userId || !identity?.workspaceId || !identity?.conversationId) return false;
      const key = identityKey(identity);
      if (!stacks.has(key)) return false;
      stacks.delete(key);
      return true;
    },
    hasPending(identity) {
      return Boolean(identity?.userId && identity?.workspaceId && identity?.conversationId && getStack(identity));
    },
  });
}
