/**
 * Utilitários puros do UNIFLOW COGNITIVE LIVE CHART V1.
 * Nenhuma dependência externa — apenas matemática de escala e construção
 * de paths SVG. Mantido separado do componente para evitar duplicação
 * entre as variantes `compact` e `detailed`.
 */

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Cria uma função de escala linear simples: domínio -> intervalo. */
export function createLinearScale([domainMin, domainMax], [rangeMin, rangeMax]) {
  const domainSpan = domainMax - domainMin || 1;
  const rangeSpan = rangeMax - rangeMin;
  return (value) => rangeMin + ((value - domainMin) / domainSpan) * rangeSpan;
}

/** Retorna [min, max] de uma chave numérica em uma lista de datasets. */
export function getDomain(datasets, key) {
  let min = Infinity;
  let max = -Infinity;
  datasets.forEach((dataset) => {
    dataset.forEach((point) => {
      if (point[key] < min) min = point[key];
      if (point[key] > max) max = point[key];
    });
  });
  if (min === Infinity) return [0, 1];
  return [min, max];
}

/**
 * Converte uma lista de pontos {day, value} em coordenadas de tela usando as
 * escalas fornecidas.
 */
export function toScreenPoints(data, valueKey, xScale, yScale) {
  return data.map((point) => ({
    x: xScale(point.day),
    y: yScale(point[valueKey]),
    day: point.day,
    label: point.label,
    value: point[valueKey],
  }));
}

/**
 * Constrói um path suave (curva) a partir de pontos de tela, usando
 * interpolação de Catmull-Rom convertida em curvas de Bézier cúbicas.
 * Suave o bastante para o efeito "premium 2.5D" sem exigir bibliotecas
 * externas de gráficos.
 */
export function buildSmoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

/** Fecha um path de linha em um path de área, apoiado numa linha de base. */
export function buildAreaPath(linePath, points, baselineY) {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

/** Encontra o índice do ponto mais próximo de um valor x em pixels. */
export function findNearestIndex(screenPoints, targetX) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  screenPoints.forEach((point, index) => {
    const distance = Math.abs(point.x - targetX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}%`;
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Verdadeiro quando ao menos um ponto da série possui receita ou despesa
 * diferente de zero. Usado para decidir o estado vazio do gráfico sem
 * inventar dados: quando falso, o componente não deve desenhar nenhuma
 * linha/área/ponto com valores (mesmo que sejam zero).
 */
export function hasRealData(data) {
  return Array.isArray(data) && data.some(
    (point) => Number(point?.receita || 0) !== 0 || Number(point?.despesa || 0) !== 0,
  );
}
