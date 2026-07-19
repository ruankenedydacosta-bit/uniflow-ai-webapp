import {
  calcMonthlyAverages,
  calcAllScenarioProjections,
  calcSavingsCapacity,
  calcAllGoalProjections,
  calcProjectionSummary,
  buildChartData,
} from './futureCalculations.js';
import { SCENARIOS, HORIZONS } from './futureConstants.js';

const DEFAULT_SCENARIO_IDS = [SCENARIOS.CONSERVATIVE, SCENARIOS.LIKELY, SCENARIOS.ACCELERATED];

export function buildFutureProjections({
  workspaceBalance = 0,
  transactions = [],
  goals = [],
  scenarioIds = DEFAULT_SCENARIO_IDS,
  selectedHorizon = 6,
} = {}) {
  const currentBalance = Number(workspaceBalance) || 0;
  const { avgIncome, avgExpense, monthsWithData, netResult } = calcMonthlyAverages(transactions);

  const hasHistory = monthsWithData > 0;

  const scenarioProjections = hasHistory
    ? calcAllScenarioProjections(currentBalance, avgIncome, avgExpense, scenarioIds, selectedHorizon)
    : scenarioIds.reduce((acc, id) => {
        acc[id] = {
          projectedBalance: currentBalance,
          monthlyResult: 0,
          monthsProjected: selectedHorizon,
          hasData: false,
        };
        return acc;
      }, {});

  const savingsCapacity = {};
  for (const sid of scenarioIds) {
    savingsCapacity[sid] = hasHistory
      ? calcSavingsCapacity(netResult, sid)
      : 0;
  }

  const goalProjections = hasHistory
    ? calcAllGoalProjections(goals, netResult, SCENARIOS.LIKELY)
    : [];

  const goalSummary = calcProjectionSummary(goalProjections);

  const chartData = hasHistory
    ? buildChartData(currentBalance, avgIncome, avgExpense, scenarioIds, selectedHorizon)
    : [];

  return {
    currentBalance,
    avgIncome: hasHistory ? avgIncome : 0,
    avgExpense: hasHistory ? avgExpense : 0,
    netResult: hasHistory ? netResult : 0,
    monthsWithData,
    hasHistory,
    totalTransactions: transactions.length,
    activeGoals: goals.filter((g) => g.status === 'active' || g.status === 'paused').length,

    scenarioProjections,
    savingsCapacity,
    goalProjections,
    goalSummary,
    chartData,

    selectedHorizon,
    availableHorizons: HORIZONS,
    availableScenarios: DEFAULT_SCENARIO_IDS,
  };
}
