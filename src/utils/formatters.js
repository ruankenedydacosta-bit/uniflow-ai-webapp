export function formatCurrency(value, locale = 'pt-BR', currency = 'BRL') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(Number(value || 0));
}

export function formatDate(value, locale = 'pt-BR') {
  if (!value) return '';

  return new Intl.DateTimeFormat(locale).format(new Date(value));
}