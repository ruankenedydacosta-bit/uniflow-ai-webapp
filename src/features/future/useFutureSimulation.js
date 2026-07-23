import { useCallback, useMemo, useState } from 'react';
import { buildFutureSimulation } from './futureSimulation.js';

const EMPTY_OVERRIDES = Object.freeze({
  monthlyIncomeDelta: 0,
  monthlyExpenseDelta: 0,
  initialBalanceDelta: 0,
});

// Hook mínimo de orquestração: mantém apenas os overrides em estado de
// componente (nunca armazenamento do navegador, backend, roteamento ou
// contexto compartilhado) e delega toda a regra de simulação à função pura
// buildFutureSimulation. Aceita os dados-base
// completos (mesmo shape usado por useFutureData()), nunca apenas uma
// projeção já pronta — o hook nunca substitui useFutureData().
export function useFutureSimulation({
  workspaceBalance = 0,
  transactions = [],
  goals = [],
  scenarioIds,
  selectedHorizon = 6,
} = {}) {
  const [overrides, setOverridesState] = useState(EMPTY_OVERRIDES);

  const setOverride = useCallback((key, value) => {
    setOverridesState((current) => ({ ...current, [key]: value }));
  }, []);

  const setOverrides = useCallback((nextOverrides) => {
    setOverridesState((current) => ({ ...current, ...nextOverrides }));
  }, []);

  const resetSimulation = useCallback(() => {
    setOverridesState(EMPTY_OVERRIDES);
  }, []);

  const simulation = useMemo(
    () => buildFutureSimulation({
      workspaceBalance,
      transactions,
      goals,
      overrides,
      scenarioIds,
      selectedHorizon,
    }),
    [workspaceBalance, transactions, goals, overrides, scenarioIds, selectedHorizon],
  );

  return {
    overrides: simulation.overrides,
    isActive: simulation.isActive,
    baseInputs: simulation.baseInputs,
    simulatedInputs: simulation.simulatedInputs,
    simulatedProjections: simulation.simulatedProjections,
    setOverride,
    setOverrides,
    resetSimulation,
  };
}
