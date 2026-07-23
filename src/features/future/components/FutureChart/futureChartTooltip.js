import { formatCurrency } from '../../../../utils/formatters.js';

// Texto puro do tooltip nativo (SVG <title>) de um ponto de comparação.
// Nunca fabrica valor: lado ausente/inválido vira "Não disponível", nunca
// zero. Diferença só é calculada quando os dois lados estão disponíveis.
const UNAVAILABLE_TEXT = 'Não disponível';

function formatValueOrUnavailable(value) {
  return typeof value === 'number' && Number.isFinite(value) ? formatCurrency(value) : UNAVAILABLE_TEXT;
}

export function buildComparisonTooltipText(point) {
  if (!point) return '';

  const lines = [
    point.label,
    `Real: ${formatValueOrUnavailable(point.realValue)}`,
    `Simulado: ${formatValueOrUnavailable(point.simulatedValue)}`,
  ];

  const hasBothValues = typeof point.realValue === 'number' && Number.isFinite(point.realValue)
    && typeof point.simulatedValue === 'number' && Number.isFinite(point.simulatedValue);

  if (hasBothValues) {
    const diff = point.simulatedValue - point.realValue;
    // F5.6: sinal decidido pelo valor arredondado a centavos — evita
    // "Diferença: -R$ 0,00" quando o resíduo é apenas ruído de ponto
    // flutuante (a UI já mostraria R$ 0,00 de qualquer forma).
    const roundedToCents = Math.round(diff * 100) / 100;
    const diffText = roundedToCents === 0 ? formatCurrency(0) : `${roundedToCents > 0 ? '+' : ''}${formatCurrency(diff)}`;
    lines.push(`Diferença: ${diffText}`);
  }

  return lines.join('\n');
}
