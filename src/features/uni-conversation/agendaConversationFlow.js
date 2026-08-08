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
  createAgendaItem,
  deleteAgendaItem,
  listAgendaItems,
  setAgendaItemStatus,
  updateAgendaItem,
} from '../../services/agendaService.js';

const AGENDA_INTENTS = new Set([
  'agenda_reminder_create',
  'agenda_schedule_create',
  'agenda_edit',
  'agenda_complete',
  'agenda_cancel',
  'agenda_query',
  'agenda_no_time',
]);

const PENDING_TYPES = Object.freeze({
  CREATE: 'agenda_create',
  CANCEL: 'agenda_cancel_confirmation',
  DISAMBIGUATE: 'agenda_disambiguation',
});

const NUMBER_WORDS = Object.freeze({
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
});

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

function resolveAgendaDate(text, referenceDate) {
  const normalized = normalizeFinancialText(text);
  const relative = normalized.match(/\bdaqui\s+(?:a\s+|uns?\s+|umas?\s+|cerca\s+de\s+)?([\w\s]+?)\s+(dias?|semanas?)\b/);
  if (relative) {
    const count = parseCount(relative[1]);
    if (count && count <= 365) {
      return shiftDate(referenceDate, count * (relative[2].startsWith('semana') ? 7 : 1));
    }
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

function extractTime(text) {
  const normalized = normalizeFinancialText(text);
  const match = normalized.match(/\b(?:as|para)\s+(\d{1,2})(?:[:h](\d{2}))?\s*h?\b/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function extractTitle(text) {
  const normalized = normalizeFinancialText(text)
    .replace(/\b(?:me\s+)?lembra(?:r)?\s+(?:de|da|do)?\s*/g, '')
    .replace(/\b(?:eu\s+)?tenho\s+(?:uma|um)?\s*/g, '')
    .replace(/\b(?:bota|anota|marca|agende|agenda|cria)\s+(?:ai\s+)?(?:na\s+agenda\s+)?/g, '')
    .replace(/\b(?:muda|remarca|reagenda|adia|antecipa)\s+(?:meu|minha|o|a)?\s*/g, '')
    .replace(/\b(?:cancela|cancelar|desmarca|desmarcar|exclui|excluir)\s+(?:meu|minha|o|a)?\s*/g, '')
    .replace(/\b(?:ja\s+fiz|conclui|finalizei)\s+(?:aquele|aquela|o|a)?\s*/g, '')
    .replace(/\b(?:pode\s+)?marcar\s+como\s+concluida?\b/g, '')
    .replace(/\bdaqui\s+(?:a\s+|uns?\s+|umas?\s+|cerca\s+de\s+)?[\w\s]+?\s+(?:dias?|semanas?)\b/g, '')
    .replace(/\b(?:hoje|amanha|depois\s+de\s+amanha|fim\s+do\s+mes|final\s+do\s+mes)\b/g, '')
    .replace(/\b(?:de|na|no|para)\s+(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/g, '')
    .replace(/\b(?:as|para)\s+\d{1,2}(?:[:h]\d{2})?\s*h?\b/g, '')
    .replace(/\b(?:aquele|aquela)\s+(?:coisa|negocio|compromisso)\b/g, '')
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:de|da|do|para|na|no)\s*$/g, '')
    .trim();
  return normalized || null;
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
  return normalizeFinancialText(value ?? '');
}

function matchesTitle(item, subject) {
  const candidate = normalizeIdentity(`${item.title ?? ''} ${item.description ?? ''}`);
  const expected = normalizeIdentity(subject);
  return expected && candidate.includes(expected);
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

function serviceErrorText() {
  return 'Não consegui atualizar sua agenda agora. Tente novamente em instantes.';
}

export function createAgendaConversationFlow({ services = defaultServices } = {}) {
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

  function startPending(identity, type, fields) {
    const base = getStack(identity) ?? createPendingActionStack(identity);
    const transition = pushPendingAction(base, {
      id: `agenda-${type}-${++actionSequence}`,
      type,
      deduplicationKey: `${type}:${normalizeIdentity(JSON.stringify(fields))}`,
      fields,
    });
    setStack(identity, transition.stack);
    return transition.activeAction;
  }

  function finishPending(identity, active, result) {
    const transition = completePendingAction(getStack(identity), active.id, result);
    setStack(identity, transition.stack);
  }

  async function createItem(identity, fields) {
    const result = await services.createAgendaItem(identity.workspaceId, {
      item_type: fields.itemType ?? 'appointment',
      title: fields.title,
      starts_at: toStartIso(fields.date, fields.time, fields.allDay),
      ends_at: null,
      is_all_day: Boolean(fields.allDay),
    });
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
      const changes = {};
      const date = fields.date ?? localIsoDate(new Date(item.starts_at));
      if (fields.time) {
        changes.starts_at = toStartIso(date, fields.time, false);
        changes.is_all_day = false;
      }
      const result = await services.updateAgendaItem(identity.workspaceId, item.id, changes);
      return result.error ? { handled: true, text: serviceErrorText() } : { handled: true, text: successText(action, result.data) };
    }
    if (action === 'delete') {
      const result = await services.deleteAgendaItem(identity.workspaceId, item.id);
      return result.error
        ? { handled: true, text: serviceErrorText() }
        : { handled: true, text: successText(action, item) };
    }
    const status = action === 'complete' ? 'completed' : 'cancelled';
    const result = await services.setAgendaItemStatus(identity.workspaceId, item.id, status);
    return result.error ? { handled: true, text: serviceErrorText() } : { handled: true, text: successText(action, result.data) };
  }

  async function handlePending(text, identity, referenceDate) {
    const stack = getStack(identity);
    const active = stack ? getActivePendingAction(stack) : null;
    if (!active) return null;
    const normalized = normalizeFinancialText(text);

    if (/^(?:cancela|cancelar|deixa|deixa pra la|nao quero)[.!]?$/.test(normalized)) {
      const transition = cancelPendingAction(stack, active.id, { cascade: true });
      setStack(identity, transition.stack);
      return { handled: true, text: 'Tudo bem. Não alterei sua agenda.' };
    }

    if (active.type === PENDING_TYPES.CREATE) {
      const fields = { ...active.fields };
      if (!fields.title) fields.title = extractTitle(text);
      const noTime = /\b(?:sem\s+horario|pode\s+deixar\s+sem\s+horario|compromisso\s+do\s+dia|dia\s+inteiro)\b/.test(normalized);
      const time = extractTime(text);
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
      if (result.error) return { handled: true, text: serviceErrorText() };
      finishPending(identity, { ...active, id: updated.action.id }, result.data);
      return { handled: true, text: successText('create', result.data) };
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
      const selectedTime = extractTime(text);
      const selected = active.fields.items.find((item) => matchesTitle(item, text))
        ?? active.fields.items.find((item) => {
          if (!selectedTime || item.is_all_day) return false;
          const date = new Date(item.starts_at);
          return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` === selectedTime;
        })
        ?? (active.fields.items.length === 1 ? active.fields.items[0] : null);
      if (!selected) {
        return {
          handled: true,
          text: `Qual deles você quer? ${active.fields.items.map(formatDateTime).join('; ')}.`,
        };
      }
      finishPending(identity, active, selected);
      if (['cancel', 'delete'].includes(active.fields.action)) {
        startPending(identity, PENDING_TYPES.CANCEL, {
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

  async function handle({ text, identity, referenceDate }) {
    if (!identity?.userId || !identity?.workspaceId || !identity?.conversationId) {
      return { handled: true, text: 'Não consegui identificar seu espaço atual. Atualize a página e tente novamente.' };
    }

    const pendingResult = await handlePending(text, identity, referenceDate);
    if (pendingResult) return pendingResult;

    const classification = classifyIntent(text);
    if (!AGENDA_INTENTS.has(classification.intent)) return { handled: false };
    if (classification.intent === 'agenda_no_time') {
      return { handled: true, text: 'Essa resposta precisa estar ligada a um compromisso que ainda estou montando.' };
    }

    if (['agenda_reminder_create', 'agenda_schedule_create'].includes(classification.intent)) {
      const fields = {
        title: classification.signals.includes('agenda_vague_subject') ? null : extractTitle(text),
        date: resolveAgendaDate(text, referenceDate),
        time: extractTime(text),
        allDay: false,
        itemType: classification.intent === 'agenda_reminder_create' ? 'reminder' : 'appointment',
      };
      if (!fields.title || !fields.date || !fields.time) {
        startPending(identity, PENDING_TYPES.CREATE, fields);
        if (!fields.title) return { handled: true, text: 'Claro. O que você quer que eu coloque na agenda?' };
        if (!fields.date) return { handled: true, text: `Em qual dia você quer marcar ${fields.title}?` };
        return { handled: true, text: 'Quer colocar um horário ou deixo como compromisso do dia?' };
      }
      const result = await createItem(identity, fields);
      return result.error
        ? { handled: true, text: serviceErrorText() }
        : { handled: true, text: successText('create', result.data) };
    }

    if (classification.intent === 'agenda_query') {
      const bounds = queryBounds(text, referenceDate);
      const result = await services.listAgendaItems(identity.workspaceId, {
        ...(bounds ?? {}),
        status: 'scheduled',
      });
      if (result.error) return { handled: true, text: serviceErrorText() };
      if (!result.data?.length) return { handled: true, text: 'Você não tem compromissos nesse período.' };
      return { handled: true, text: `Você tem: ${result.data.map(formatDateTime).join('; ')}.` };
    }

    const normalizedText = normalizeFinancialText(text);
    const action = classification.intent === 'agenda_edit'
      ? 'edit'
      : classification.intent === 'agenda_complete'
        ? 'complete'
        : /\b(?:excluir|exclui|remover|remove)\b/.test(normalizedText)
          ? 'delete'
          : 'cancel';
    const subject = extractTitle(text);
    const date = resolveAgendaDate(text, referenceDate);
    const candidates = await findCandidates(identity, { subject, date });
    if (candidates.error) return { handled: true, text: serviceErrorText() };
    if (!candidates.data.length) return { handled: true, text: 'Não encontrei esse compromisso na sua agenda.' };
    if (candidates.data.length > 1) {
      startPending(identity, PENDING_TYPES.DISAMBIGUATE, {
        action,
        items: candidates.data,
        changes: { time: extractTime(text), date },
      });
      return { handled: true, text: `Encontrei mais de um. Qual deles você quer? ${candidates.data.map(formatDateTime).join('; ')}.` };
    }
    if (['cancel', 'delete'].includes(action)) {
      startPending(identity, PENDING_TYPES.CANCEL, { action, item: candidates.data[0] });
      return {
        handled: true,
        text: action === 'delete'
          ? `Quer mesmo excluir ${candidates.data[0].title} da sua agenda?`
          : `Quer mesmo cancelar ${candidates.data[0].title}?`,
      };
    }
    return executeSelected(identity, action, candidates.data[0], {
      time: extractTime(text),
      date,
    });
  }

  return Object.freeze({
    handle,
    hasPending(identity) {
      return Boolean(identity?.userId && identity?.workspaceId && identity?.conversationId && getStack(identity));
    },
  });
}
