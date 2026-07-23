// Adaptador puro que extrai, de duas projeções já calculadas, os pontos
// mensais equivalentes (mesmo cenário, mesmo horizonte) para sobrepor no
// gráfico existente. Nunca recalcula projeção, nunca chama
// buildFutureProjections, nunca acessa React/Supabase, nunca muta as
// entradas — apenas lê `chartData` (já pronto, gerado pelo motor oficial)
// dos dois objetos e alinha os pontos por `label` (chave estável: "Hoje",
// "Mês 1", "Mês 2"... gerada deterministicamente pelo motor para o mesmo
// horizonte — nunca por posição bruta do array).

function isSafeFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function buildFutureChartComparison({
  realProjections,
  simulatedProjections,
  scenarioId,
  selectedHorizon,
} = {}) {
  if (!realProjections || !simulatedProjections || !scenarioId) {
    return { isComparable: false, scenarioId: scenarioId ?? null, points: [], unavailableReason: 'missing_input' };
  }

  if (!realProjections.hasHistory || !simulatedProjections.hasHistory) {
    return { isComparable: false, scenarioId, points: [], unavailableReason: 'insufficient_history' };
  }

  if (realProjections.selectedHorizon !== simulatedProjections.selectedHorizon) {
    return { isComparable: false, scenarioId, points: [], unavailableReason: 'horizon_mismatch' };
  }

  if (typeof selectedHorizon === 'number' && realProjections.selectedHorizon !== selectedHorizon) {
    return { isComparable: false, scenarioId, points: [], unavailableReason: 'horizon_mismatch' };
  }

  const realAvailable = Array.isArray(realProjections.availableScenarios) ? realProjections.availableScenarios : [];
  const simulatedAvailable = Array.isArray(simulatedProjections.availableScenarios) ? simulatedProjections.availableScenarios : [];
  if (!realAvailable.includes(scenarioId) || !simulatedAvailable.includes(scenarioId)) {
    return { isComparable: false, scenarioId, points: [], unavailableReason: 'scenario_mismatch' };
  }

  const realChart = Array.isArray(realProjections.chartData) ? realProjections.chartData : [];
  const simulatedChart = Array.isArray(simulatedProjections.chartData) ? simulatedProjections.chartData : [];

  const simulatedByLabel = new Map();
  for (const point of simulatedChart) {
    if (point && typeof point.label === 'string' && !simulatedByLabel.has(point.label)) {
      simulatedByLabel.set(point.label, point);
    }
  }

  const points = [];
  for (const realPoint of realChart) {
    const label = realPoint?.label;
    if (typeof label !== 'string') continue;

    const simulatedPoint = simulatedByLabel.get(label);
    if (!simulatedPoint) continue;

    const realValue = isSafeFiniteNumber(realPoint[scenarioId]) ? realPoint[scenarioId] : null;
    const simulatedValue = isSafeFiniteNumber(simulatedPoint[scenarioId]) ? simulatedPoint[scenarioId] : null;
    if (realValue === null && simulatedValue === null) continue;

    points.push({ key: label, label, realValue, simulatedValue });
  }

  return {
    isComparable: points.length > 0,
    scenarioId,
    points,
    unavailableReason: points.length > 0 ? null : 'no_comparable_points',
  };
}
