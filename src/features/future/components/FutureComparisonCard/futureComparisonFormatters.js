import { formatCurrency } from '../../../../utils/formatters.js';

// Formatação pura para a UI de comparação. A função de domínio
// (futureComparison.js) retorna sempre números (ou null); só aqui, na
// borda de apresentação, números viram texto. Nenhum valor ausente vira
// "R$ 0,00" — formatCurrency(null) faria isso silenciosamente
// (Number(null || 0) === 0), por isso o null é sempre checado antes.
const UNAVAILABLE_TEXT = 'Não disponível';

// F5.6: o sinal (e a decisão de omitir "-R$ 0,00"/"-0.0%") usa o valor já
// arredondado na mesma granularidade exibida (centavos / 1 casa decimal),
// não o valor bruto. Ruído de ponto flutuante (ex.: -0.0009) já produzia
// "-R$ 0,00"/"-0.0%" — um sinal negativo para uma diferença que a própria
// UI mostra como zero.
export function formatSignedCurrency(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return UNAVAILABLE_TEXT;
  const roundedToCents = Math.round(value * 100) / 100;
  if (roundedToCents === 0) return formatCurrency(0);
  const sign = roundedToCents > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

export function formatSignedPercent(value) {
  if (value === null || typeof value !== 'number' || !Number.isFinite(value)) return UNAVAILABLE_TEXT;
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return '0.0%';
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
}

export function directionLabel(direction) {
  if (direction === 'higher') return 'Resultado simulado maior';
  if (direction === 'lower') return 'Resultado simulado menor';
  return 'Sem alteração';
}
