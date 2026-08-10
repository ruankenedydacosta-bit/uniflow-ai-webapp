const DATE_CHIP_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
});

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatAgendaDateChip(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = DATE_CHIP_FORMATTER.formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value
    ?.replace('.', '')
    .toLocaleUpperCase('pt-BR') ?? '';
  return `${day} ${month}`.trim();
}

export function formatAgendaTimeChip(item) {
  if (item.is_all_day) return 'Dia inteiro';
  if (item.has_explicit_time === false) return 'Sem horário';

  const start = new Date(item.starts_at);
  if (Number.isNaN(start.getTime())) return '';
  const startLabel = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  if (!item.ends_at) return startLabel;

  const end = new Date(item.ends_at);
  if (Number.isNaN(end.getTime())) return startLabel;
  return `${startLabel}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

/** Adapta o registro persistente ao contrato semantico consumido pelo card. */
export function buildAgendaItemPresentation(item) {
  const start = new Date(item.starts_at);
  const validStart = !Number.isNaN(start.getTime());
  const allDay = Boolean(item.is_all_day);
  const hasExplicitTime = !allDay && item.has_explicit_time !== false;
  return {
    title: item.title,
    date: validStart
      ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
      : null,
    time: hasExplicitTime && validStart
      ? `${pad(start.getHours())}:${pad(start.getMinutes())}`
      : null,
    description: item.description ?? null,
    allDay,
    hasExplicitTime,
    dateLabel: formatAgendaDateChip(item.starts_at),
    timeLabel: formatAgendaTimeChip(item),
  };
}
