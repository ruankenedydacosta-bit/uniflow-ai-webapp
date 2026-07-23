import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAccess } from '../../app/AccessContext';
import { SCENARIOS } from './futureConstants';
import { useFutureData } from './useFutureData';
import { useFutureSimulation } from './useFutureSimulation';
import { buildFutureComparison } from './futureComparison';
import { buildFutureChartComparison } from './futureChartComparison';
import Button from '../../components/ui/Button';
import FutureHeader from './components/FutureHeader/FutureHeader';
import FutureSummary from './components/FutureSummary/FutureSummary';
import FutureChart from './components/FutureChart/FutureChart';
import FutureScenarios from './components/FutureScenarios/FutureScenarios';
import FutureGoals from './components/FutureGoals/FutureGoals';
import FutureExplanation from './components/FutureExplanation/FutureExplanation';
import FutureSimulationPanel from './components/FutureSimulationPanel/FutureSimulationPanel';
import FutureComparisonCard from './components/FutureComparisonCard/FutureComparisonCard';
import styles from './FuturePage.module.css';

export default function FuturePage() {
  const navigate = useNavigate();
  const { access } = useAccess();

  const [selectedHorizon, setSelectedHorizon] = useState(6);
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS.LIKELY);
  const [isSimulationPanelOpen, setIsSimulationPanelOpen] = useState(false);
  const [simulationResetKey, setSimulationResetKey] = useState(0);

  const {
    isLoading,
    error,
    projections,
    baseInputs,
    hasData,
  } = useFutureData({
    selectedScenario,
    selectedHorizon,
  });

  // Mesmo snapshot de dados-base já usado por useFutureData() para a
  // projeção real (F5.3.1) — sem segunda busca, sem risco de a simulação
  // enxergar um saldo/transações/metas de um instante diferente da visão real.
  const simulation = useFutureSimulation({
    ...baseInputs,
    scenarioIds: projections.availableScenarios,
    selectedHorizon,
  });

  const displayedProjections = simulation.isActive ? simulation.simulatedProjections : projections;

  // Só existe enquanto a simulação está ativa; nunca recalcula projeção
  // (usa exatamente os dois objetos já prontos). Sair da simulação zera
  // simulation.isActive, e a comparação desaparece imediatamente.
  const comparison = simulation.isActive
    ? buildFutureComparison({
        realProjections: projections,
        simulatedProjections: simulation.simulatedProjections,
        selectedHorizon,
      })
    : null;

  // Comparação gráfica (F5.5): mesmo par real/simulado da comparação textual
  // acima, restrita ao cenário selecionado (evita sobrepor 3 cenários × 2 =
  // 6 linhas). Nunca deriva a série real de displayedProjections — sempre
  // de projections diretamente, para não perder a referência real durante
  // a simulação.
  const chartComparison = simulation.isActive
    ? buildFutureChartComparison({
        realProjections: projections,
        simulatedProjections: simulation.simulatedProjections,
        scenarioId: selectedScenario,
        selectedHorizon,
      })
    : null;

  const {
    avgIncome,
    avgExpense,
    monthsWithData,
    scenarioProjections = {},
    goalProjections = [],
    goalSummary,
    chartData = [],
    availableScenarios = [],
  } = displayedProjections;

  function handleStartSimulation() {
    setIsSimulationPanelOpen(true);
  }

  function handleExitSimulation() {
    simulation.resetSimulation();
    setIsSimulationPanelOpen(false);
    setSimulationResetKey((key) => key + 1);
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonGrid}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
        <div className={styles.skeletonChart} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <FutureHeader
          currentWorkspace={access.currentWorkspace}
          selectedHorizon={selectedHorizon}
          onHorizonChange={setSelectedHorizon}
        />
        <div className={styles.errorState}>
          <p>Não foi possível carregar os dados.</p>
          <p className={styles.errorDetail}>{error.message || 'Erro desconhecido'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <FutureHeader
        currentWorkspace={access.currentWorkspace}
        selectedHorizon={selectedHorizon}
        onHorizonChange={setSelectedHorizon}
      />

      {isSimulationPanelOpen ? (
        <FutureSimulationPanel
          key={simulationResetKey}
          isActive={simulation.isActive}
          hasHistory={hasData}
          simulatedBalance={simulation.simulatedInputs?.workspaceBalance}
          onChangeOverride={simulation.setOverride}
          onExit={handleExitSimulation}
        />
      ) : (
        <div className={styles.simulationActions}>
          <Button variant="outline" size="sm" onClick={handleStartSimulation}>
            Simular cenário
          </Button>
        </div>
      )}

      {!hasData ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p className={styles.emptyTitle}>Nenhum dado financeiro encontrado</p>
          <p className={styles.emptyText}>
            Para gerar projeções, precisamos de transações financeiras registradas.
            Adicione receitas e despesas no Financeiro para começar.
          </p>
        </div>
      ) : (
        <>
          {simulation.isActive && (
            <p className={styles.simulationDataNotice} role="status">
              Os valores abaixo (resumo, gráfico, cenários e metas) refletem a simulação ativa, não seus dados reais.
            </p>
          )}

          <FutureSummary
            scenarioProjection={scenarioProjections[selectedScenario]}
            goalSummary={goalSummary}
            selectedScenario={selectedScenario}
            hasData={hasData}
          />

          <FutureChart
            chartData={chartData}
            scenarioIds={availableScenarios}
            selectedScenario={selectedScenario}
            hasData={hasData}
            comparisonSeries={chartComparison}
          />

          <FutureComparisonCard comparison={comparison} />

          <FutureScenarios
            scenarioProjections={scenarioProjections}
            selectedScenario={selectedScenario}
            onScenarioChange={setSelectedScenario}
            hasData={hasData}
          />

          <FutureGoals
            goalProjections={goalProjections}
            hasData={hasData}
          />

          <FutureExplanation
            hasData={hasData}
            monthsWithData={monthsWithData}
            avgIncome={avgIncome}
            avgExpense={avgExpense}
          />

          <div className={styles.navLinks}>
            <Button variant="outline" size="sm" onClick={() => navigate('/objetivos')}>
              Ajustar metas
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/financeiro')}>
              Revisar movimentações
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
