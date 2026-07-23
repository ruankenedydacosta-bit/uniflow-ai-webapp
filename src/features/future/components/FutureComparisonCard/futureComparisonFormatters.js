import { formatCurrency } from '../../../../utils/formatters.js';

// Formatação pura para a UI de comparação. A função de domínio
// (futureComparison.js) retorna sempre números (ou null); só aqui, na
// borda de apresentação, números viram texto. Nenhum valor ausente vira
// "R$ 0,00" — formatCurrency(null) faria isso silenciosamente
// (Number(null || 0) === 0), por isso o null é sempre checado antes.
const UNAVAILABLE_TEXT = 'Não disponível';

export function formatSignedCurrency(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return UNAVAILABLE_TEXT;
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

export function formatSignedPercent(value) {
  if (value === null || typeof value !== 'number' || !Number.isFinite(value)) return UNAVAILABLE_TEXT;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function directionLabel(direction) {
  if (direction === 'higher') return 'Resultado simulado maior';
  if (direction === 'lower') return 'Resultado simulado menor';
  return 'Sem alteração';
}
