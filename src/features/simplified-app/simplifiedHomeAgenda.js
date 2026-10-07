import { formatAgendaItemTime, toDateKey } from './simplifiedAgendaCalendar.js';

// Lógica pura da timeline do dia na Home (redesign, #89). Sem React nem
// Supabase: recebe os itens já carregados e o relógio, devolve o que a
// Timeline (src/components/ui/Timeline) desenha.

const DONE_STATUSES = new Set(['completed', 'cancelled']);

// Cor do marcador por tipo de item: tarefa é violeta, lembrete é verde e o
// resto (compromisso, reunião, vencimento, recebimento) é azul.
export function resolveAgendaItemTone(item) {
  if (item?.item_type === 'task') return 'violet';
  if (item?.item_type === 'reminder') return 'green';
  return 'blue';
}

function toTimestamp(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function startTimestamp(item) {
  return toTimestamp(item?.starts_at);
}

function endTimestamp(item) {
  return toTimestamp(item?.ends_at) ?? startTimestamp(item);
}

function firstLine(value) {
  return String(value ?? '').split('\n')[0].trim();
}

/** "Dra. Paula · Av. Paulista": observação e local, quando existirem. */
export function buildAgendaItemDetail(item) {
  return [firstLine(item?.description), firstLine(item?.location)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Intervalo de consulta da Home: de hoje 00:00 até amanhã 23:59:59 (hora
 * local), em ISO UTC, como o useAgenda espera.
 */
export function buildHomeAgendaRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
  return Object.freeze({ startsFrom: start.toISOString(), startsTo: end.toISOString() });
}

function sortByStart(items) {
  return [...items].sort((a, b) => (startTimestamp(a) ?? 0) - (startTimestamp(b) ?? 0));
}

function toTimelineItems(items, { now, markPast }) {
  const nowTime = now.getTime();
  let nextMarked = false;
  return items.map((item) => {
    const isDone = DONE_STATUSES.has(item.status)
      || (markPast && (endTimestamp(item) ?? 0) < nowTime);
    let status = isDone ? 'done' : 'default';
    if (!isDone && !nextMarked) {
      status = 'next';
      nextMarked = true;
    }
    return Object.freeze({
      id: item.id,
      time: formatAgendaItemTime(item),
      dateTime: item.starts_at,
      title: item.title,
      detail: buildAgendaItemDetail(item) || undefined,
      tone: resolveAgendaItemTone(item),
      status,
    });
  });
}

/**
 * Decide o que a Home mostra: os itens de hoje sob "Hoje"; sem nada hoje,
 * os de amanhã sob "Amanhã"; sem nada nos dois dias, "Hoje" vazio.
 */
export function buildHomeTimeline(items, now = new Date()) {
  const todayKey = toDateKey(now);
  const tomorrowKey = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const today = [];
  const tomorrow = [];
  for (const item of items ?? []) {
    const time = startTimestamp(item);
    if (time === null) continue;
    const key = toDateKey(new Date(time));
    if (key === todayKey) today.push(item);
    else if (key === tomorrowKey) tomorrow.push(item);
  }

  if (today.length > 0) {
    return Object.freeze({
      title: 'Hoje',
      items: toTimelineItems(sortByStart(today), { now, markPast: true }),
    });
  }
  if (tomorrow.length > 0) {
    return Object.freeze({
      title: 'Amanhã',
      items: toTimelineItems(sortByStart(tomorrow), { now, markPast: false }),
    });
  }
  return Object.freeze({ title: 'Hoje', items: [] });
}
