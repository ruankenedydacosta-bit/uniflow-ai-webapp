export { default as FuturePage } from './FuturePage';
export { useFutureData } from './useFutureData';
export { buildFutureProjections } from './futureService';
export {
  calcMonthlyAverages,
  calcProjectedBalance,
  calcScenarioProjection,
  calcAllScenarioProjections,
  calcSavingsCapacity,
  calcGoalProjection,
  calcAllGoalProjections,
  calcProjectionSummary,
  buildChartData,
} from './futureCalculations';
export { SCENARIOS, SCENARIO_CONFIG, HORIZONS, GOAL_FEASIBILITY } from './futureConstants';
export { buildFutureSimulation, normalizeFutureSimulationOverrides } from './futureSimulation';
export { useFutureSimulation } from './useFutureSimulation';
