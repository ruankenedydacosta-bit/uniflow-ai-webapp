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

const WEEKDAY_LONG = Object.freeze([
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
]);

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

/**
 * "sábado, 8 de agosto" a partir de um Date. Usado no painel do dia
 * selecionado e no modal de novo/editar compromisso.
 */
export function formatDayHeading(date) {
  return `${WEEKDAY_LONG[date.getDay()]}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
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
