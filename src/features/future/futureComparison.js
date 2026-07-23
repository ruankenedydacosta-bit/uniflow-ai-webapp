// Comparação pura entre a projeção oficial (real) e a projeção hipotética
// (simulada, F5.2/F5.3). Nunca chama buildFutureProjections, nunca acessa
// React/Supabase, nunca muta as duas projeções recebidas — apenas lê campos
// já existentes nos dois objetos e devolve um terceiro objeto novo.
//
// V1 conservadora: compara somente o que é diretamente equivalente e já
// existe nos dois retornos de buildFutureProjections — saldo final e
// resultado mensal por cenário (scenarioProjections[id].projectedBalance/
// monthlyResult, já é o valor no fim do horizonte, sem precisar indexar
// chartData) e, quando aplicável, a projeção de metas por goalId. Nenhuma
// métrica nova (patrimônio líquido, juros, inflação, probabilidade) é
// inventada — nada que os dois objetos não já contenham.

function isSafeFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildMetricComparison(real, simulated) {
  const delta = simulated - real;
  const rawPercentDelta = real !== 0 ? (delta / Math.abs(real)) * 100 : null;
  const percentDelta = isSafeFiniteNumber(rawPercentDelta) ? rawPercentDelta : null;

  return {
    real,
    simulated,
    delta,
    percentDelta,
    direction: delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'unchanged',
  };
}

function buildScenarioComparison(id, realScenario, simulatedScenario) {
  if (!realScenario || !simulatedScenario) return null;

  const realBalance = isSafeFiniteNumber(realScenario.projectedBalance) ? realScenario.projectedBalance : null;
  const simulatedBalance = isSafeFiniteNumber(simulatedScenario.projectedBalance) ? simulatedScenario.projectedBalance : null;
  if (realBalance === null || simulatedBalance === null) return null;

  const realMonthly = isSafeFiniteNumber(realScenario.monthlyResult) ? realScenario.monthlyResult : null;
  const simulatedMonthly = isSafeFiniteNumber(simulatedScenario.monthlyResult) ? simulatedScenario.monthlyResult : null;

  return {
    id,
    finalBalance: buildMetricComparison(realBalance, simulatedBalance),
    monthlyResult: realMonthly !== null && simulatedMonthly !== null
      ? buildMetricComparison(realMonthly, simulatedMonthly)
      : null,
  };
}

// Compara por goalId (nunca por posição do array). Metas que não existem em
// ambos os lados são ignoradas. Como a simulação nunca altera `goals`, os
// dois arrays sempre representam o mesmo conjunto de metas — a comparação
// por ID é apenas a forma correta de fazer isso, não uma proteção contra um
// cenário que hoje não ocorre.
function buildGoalsComparison(realGoalProjections, simulatedGoalProjections) {
  if (!Array.isArray(realGoalProjections) || !Array.isArray(simulatedGoalProjections)) return [];

  const simulatedById = new Map(simulatedGoalProjections.map((goal) => [goal.goalId, goal]));
  const comparisons = [];

  for (const realGoal of realGoalProjections) {
    const simulatedGoal = simulatedById.get(realGoal.goalId);
    if (!simulatedGoal) continue;

    const realMonths = isSafeFiniteNumber(realGoal.estimatedMonths) ? realGoal.estimatedMonths : null;
    const simulatedMonths = isSafeFiniteNumber(simulatedGoal.estimatedMonths) ? simulatedGoal.estimatedMonths : null;

    comparisons.push({
      goalId: realGoal.goalId,
      name: realGoal.name,
      realFeasibility: realGoal.feasibility ?? null,
      simulatedFeasibility: simulatedGoal.feasibility ?? null,
      feasibilityChanged: Boolean(realGoal.feasibility)
        && Boolean(simulatedGoal.feasibility)
        && realGoal.feasibility !== simulatedGoal.feasibility,
      estimatedMonths: realMonths !== null && simulatedMonths !== null
        ? buildMetricComparison(realMonths, simulatedMonths)
        : null,
    });
  }

  return comparisons;
}

export function buildFutureComparison({ realProjections, simulatedProjections, selectedHorizon } = {}) {
  if (!realProjections || !simulatedProjections) {
    return { isComparable: false, selectedHorizon: null, scenarios: [], goals: [], unavailableReasons: ['missing_projections'] };
  }

  if (!realProjections.hasHistory || !simulatedProjections.hasHistory) {
    return {
      isComparable: false,
      selectedHorizon: realProjections.selectedHorizon ?? null,
      scenarios: [],
      goals: [],
      unavailableReasons: ['insufficient_history'],
    };
  }

  if (realProjections.selectedHorizon !== simulatedProjections.selectedHorizon) {
    return { isComparable: false, selectedHorizon: null, scenarios: [], goals: [], unavailableReasons: ['horizon_mismatch'] };
  }

  if (typeof selectedHorizon === 'number' && realProjections.selectedHorizon !== selectedHorizon) {
    return { isComparable: false, selectedHorizon: null, scenarios: [], goals: [], unavailableReasons: ['horizon_mismatch'] };
  }

  const realScenarios = realProjections.scenarioProjections || {};
  const simulatedScenarios = simulatedProjections.scenarioProjections || {};
  const orderedIds = Array.isArray(realProjections.availableScenarios)
    ? realProjections.availableScenarios
    : Object.keys(realScenarios);

  const scenarios = orderedIds
    .filter((id) => Object.hasOwn(realScenarios, id) && Object.hasOwn(simulatedScenarios, id))
    .map((id) => buildScenarioComparison(id, realScenarios[id], simulatedScenarios[id]))
    .filter(Boolean);

  const goals = buildGoalsComparison(realProjections.goalProjections, simulatedProjections.goalProjections);

  return {
    isComparable: scenarios.length > 0,
    selectedHorizon: realProjections.selectedHorizon,
    scenarios,
    goals,
    unavailableReasons: scenarios.length > 0 ? [] : ['no_comparable_scenarios'],
  };
}
