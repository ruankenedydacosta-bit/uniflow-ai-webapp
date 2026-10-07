import { formatAgendaTimeChip } from '../../pages/agenda/agendaItemPresentation.js';

// Logica pura do calendario simples da Agenda visual (sem React/Supabase --
// testavel via node --test). Mesmo padrao de simplifiedGreeting.js: funcoes
// deterministicas, entrada -> saida, nunca tocam DOM nem relogio real
// (recebem `now` como parametro).

export const WEEKDAY_LABELS = Object.freeze(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']);

export const WEEKDAY_HEADER_LABELS = Object.freeze(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']);

const MONTH_NAMES = Object.freeze([
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]);

// Dia da semana curto e capitalizado, como no handoff ("Quinta, 23 de outubro").
const WEEKDAY_SHORT = Object.freeze([
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
]);

const DONE_STATUSES = new Set(['completed', 'cancelled']);

function toTimestamp(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Fim do item em ms: `ends_at`, senão `starts_at`. Item de dia inteiro ou
 * sem horário (`is_all_day`, `has_explicit_time === false`) só termina no
 * fim do dia local, nunca às 00:00 em que o banco guarda o início.
 */
export function resolveAgendaItemEnd(item) {
  const start = toTimestamp(item?.starts_at);
  if (start === null) return null;
  if (item?.is_all_day || item?.has_explicit_time === false) {
    const day = new Date(start);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).getTime();
  }
  return toTimestamp(item?.ends_at) ?? start;
}

/**
 * Concluído ou cancelado, ou já terminado (quando `markPast`): é o que a
 * Home e a Agenda riscam. Fonte única para as duas telas.
 */
export function isAgendaItemDone(item, { now = new Date(), markPast = true } = {}) {
  if (DONE_STATUSES.has(item?.status)) return true;
  if (!markPast) return false;
  const end = resolveAgendaItemEnd(item);
  return end !== null && end < now.getTime();
}

/**
 * Cor do marcador e da etiqueta por tipo, igual na Home e na Agenda:
 * tarefa violeta, lembrete verde, o resto (compromisso, reunião, conta,
 * recebimento) azul.
 */
export function resolveAgendaItemTone(item) {
  if (item?.item_type === 'task') return 'violet';
  if (item?.item_type === 'reminder') return 'green';
  return 'blue';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** "YYYY-MM-DD" da data LOCAL (mesmo padrao de formatDatetimeLocalValue). */
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Semana começa no DOMINGO (0) no JS; o grid visual comeca na SEGUNDA-FEIRA. */
export function getWeekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

/**
 * Grade do mes: 42 celulas (6 semanas x 7 dias), sempre comecando numa
 * SEGUNDA-FEIRA. Cada celula: { key, day, weekdayIndex, inMonth, isToday }.
 * Dias de meses vizinhos entram com inMonth=false e sao renderizados
 * suavizados, nunca pulados (grade estavel, mesmo layout em todos os mes).
 */
export function buildMonthGrid(year, month, now) {
  const firstOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
  const mondayOfFirstWeek = new Date(firstOfMonth);
  mondayOfFirstWeek.setDate(firstOfMonth.getDate() - getWeekdayIndex(firstOfMonth));

  const cells = [];
  const todayKey = toDateKey(now);
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(mondayOfFirstWeek);
    date.setDate(mondayOfFirstWeek.getDate() + i);
    const inMonth = date.getMonth() === month;
    cells.push({
      date,
      day: date.getDate(),
      weekdayIndex: getWeekdayIndex(date),
      inMonth,
      isToday: toDateKey(date) === todayKey,
    });
  }
  return cells;
}

/** "agosto 2026" (minúsculo, pt-BR). */
export function formatMonthLabel(year, month) {
  return `${MONTH_NAMES[month]} ${year}`;
}

/** "Outubro de 2026": título do mês no redesign (#89), como no Financeiro. */
export function formatMonthTitle(year, month) {
  const name = MONTH_NAMES[month];
  return `${name.charAt(0).toLocaleUpperCase('pt-BR')}${name.slice(1)} de ${year}`;
}

/** "Seg" a partir de "SEG" (os rótulos da grade continuam em caixa alta). */
export function formatWeekdayHeader(label) {
  return label.charAt(0) + label.slice(1).toLocaleLowerCase('pt-BR');
}

/**
 * "Sábado, 8 de agosto" a partir de um Date. Usado no painel do dia
 * selecionado e no modal de novo/editar compromisso.
 */
export function formatDayHeading(date) {
  return `${WEEKDAY_SHORT[date.getDay()]}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
}

/**
 * Chips de filtro da Agenda (handoff 06): cada chip agrupa tipos de item.
 * "Tudo" não filtra.
 */
export const AGENDA_KIND_FILTERS = Object.freeze([
  Object.freeze({ value: 'all', label: 'Tudo', types: null }),
  Object.freeze({ value: 'appointments', label: 'Compromissos', types: Object.freeze(['meeting', 'appointment', 'other']) }),
  Object.freeze({ value: 'bills', label: 'Contas', types: Object.freeze(['payment_due', 'receivable']) }),
  Object.freeze({ value: 'tasks', label: 'Tarefas', types: Object.freeze(['task']) }),
  Object.freeze({ value: 'reminders', label: 'Lembretes', types: Object.freeze(['reminder']) }),
]);

export function filterAgendaItemsByKind(items, kind) {
  const filter = AGENDA_KIND_FILTERS.find((option) => option.value === kind);
  if (!filter?.types) return items ?? [];
  return (items ?? []).filter((item) => filter.types.includes(item?.item_type));
}

/**
 * Estado de cada item na timeline do dia selecionado: `done` para o que
 * foi concluído ou cancelado (e, se o dia é hoje, o que já passou),
 * `next` para o primeiro pendente de um dia que ainda não acabou, e
 * `default` para o resto. Devolve na mesma ordem recebida.
 */
export function resolveAgendaTimelineStatuses(items, { now = new Date(), dayKey } = {}) {
  const todayKey = toDateKey(now);
  const isToday = dayKey === todayKey;
  const isPastDay = Boolean(dayKey) && dayKey < todayKey;
  let nextMarked = false;
  return (items ?? []).map((item) => {
    if (isAgendaItemDone(item, { now, markPast: isToday })) return 'done';
    if (!nextMarked && !isPastDay) {
      nextMarked = true;
      return 'next';
    }
    return 'default';
  });
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

const APPOINTMENT_TYPES = new Set(['meeting', 'appointment']);

/**
 * Frase da Uni no fim da Agenda (handoff 06): quantos compromissos
 * (compromisso e reunião) e quantas contas (vencimento) amanhã. Tarefa,
 * lembrete, recebimento e outros não entram na conta. Devolve null quando
 * amanhã está fora do mês carregado, para a Agenda não afirmar "nenhum"
 * sem ter os dados.
 */
export function buildTomorrowSummary(groupedItems, { now = new Date(), loadedMonth } = {}) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (loadedMonth && (tomorrow.getFullYear() !== loadedMonth.year || tomorrow.getMonth() !== loadedMonth.month)) {
    return null;
  }
  const items = groupedItems?.get(toDateKey(tomorrow)) ?? [];
  const bills = items.filter((item) => item.item_type === 'payment_due').length;
  const appointments = items.filter((item) => APPOINTMENT_TYPES.has(item.item_type)).length;
  const appointmentsText = `${appointments} ${pluralize(appointments, 'compromisso', 'compromissos')}`;
  const billsText = `${bills} ${pluralize(bills, 'conta vencendo', 'contas vencendo')}`;
  if (appointments === 0 && bills === 0) return 'Amanhã você não tem compromissos nem contas vencendo.';
  if (appointments === 0) return `Amanhã você não tem compromissos, mas tem ${billsText}.`;
  if (bills === 0) return `Amanhã você tem ${appointmentsText} e nenhuma conta vencendo.`;
  return `Amanhã você tem ${appointmentsText} e ${billsText}.`;
}

/**
 * Mover mes: retorna um NOVO objeto {year, month}, sem mutacao. delta=+1
 * vai para o mes seguinte, -1 para o anterior.
 */
export function shiftMonth(year, month, delta) {
  const date = new Date(year, month + delta, 1, 0, 0, 0, 0);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * Periodicidade de consulta: ISO UTC do inicio do mes (00:00 local) e do
 * fim do mes (23:59:59.999 local). Usado como startsFrom/startsTo do
 * useAgenda -- a grade so carrega o mes visivel, nunca o historico inteiro.
 */
export function buildMonthRange(year, month) {
  const startsAt = new Date(year, month, 1, 0, 0, 0, 0);
  const endsAt = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return {
    startsFrom: startsAt.toISOString(),
    startsTo: endsAt.toISOString(),
  };
}

/**
 * Agrupa itens de agenda (array do useAgenda) por dia. O dia e calculado
 * em hora LOCAL (`starts_at` timestamptz -> Date local -> toDateKey), o
 * mesmo recorte da grade. Itens sem starts_at valido sao descartados do
 * mapa (nunca inventados).
 */
export function groupAgendaItemsByDay(items) {
  const grouped = new Map();
  for (const item of items ?? []) {
    if (!item) continue;
    const time = new Date(item.starts_at).getTime();
    if (!Number.isFinite(time)) continue;
    const key = toDateKey(new Date(time));
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    list.sort(compareAgendaItemsByRecentActivity);
  }
  return grouped;
}

function activityTimestamp(value) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Ordenação visual determinística dentro de cada dia: atividade mais
 * recente primeiro, sem depender da ordem natural recebida do banco.
 */
export function compareAgendaItemsByRecentActivity(a, b) {
  return activityTimestamp(b?.updated_at) - activityTimestamp(a?.updated_at)
    || activityTimestamp(b?.created_at) - activityTimestamp(a?.created_at)
    || String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
}

/**
 * "10:30" em hora local para um timestamptz, ou "Dia inteiro" quando
 * item.is_all_day. Nunca retorna string crua do banco.
 */
export function formatAgendaItemTime(item) {
  return formatAgendaTimeChip(item) || 'Horário não informado';
}
