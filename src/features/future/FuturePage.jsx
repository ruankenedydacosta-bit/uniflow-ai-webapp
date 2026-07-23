import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAccess } from '../../app/AccessContext';
import { useSession } from '../../app/SessionContext';
import { useFinancialBalances } from '../../hooks/useFinancialBalances';
import { useTransactions } from '../../hooks/useTransactions';
import { useGoals } from '../goals/useGoals';
import { SCENARIOS } from './futureConstants';
import { useFutureData } from './useFutureData';
import { useFutureSimulation } from './useFutureSimulation';
import Button from '../../components/ui/Button';
import FutureHeader from './components/FutureHeader/FutureHeader';
import FutureSummary from './components/FutureSummary/FutureSummary';
import FutureChart from './components/FutureChart/FutureChart';
import FutureScenarios from './components/FutureScenarios/FutureScenarios';
import FutureGoals from './components/FutureGoals/FutureGoals';
import FutureExplanation from './components/FutureExplanation/FutureExplanation';
import FutureSimulationPanel from './components/FutureSimulationPanel/FutureSimulationPanel';
import styles from './FuturePage.module.css';

export default function FuturePage() {
  const navigate = useNavigate();
  const { access } = useAccess();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const [selectedHorizon, setSelectedHorizon] = useState(6);
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS.LIKELY);
  const [isSimulationPanelOpen, setIsSimulationPanelOpen] = useState(false);
  const [simulationResetKey, setSimulationResetKey] = useState(0);

  const {
    isLoading,
    error,
    projections,
    hasData,
  } = useFutureData({
    selectedScenario,
    selectedHorizon,
  });

  // Dados-base reais para a simulação (F5.2). useFutureData() não expõe os
  // arrays brutos (só o snapshot já calculado), e useFutureData.js está fora
  // do escopo desta subfase — por isso os mesmos hooks que ele já usa
  // internamente são chamados aqui também. Compromisso deliberado: uma
  // segunda busca dos mesmos dados, nunca uma segunda lógica de cálculo.
  const { workspaceBalance } = useFinancialBalances({ workspaceId });
  const { transactions } = useTransactions({ workspaceId });
  const { goals } = useGoals({ workspaceId });

  const simulation = useFutureSimulation({
    workspaceBalance,
    transactions,
    goals,
    scenarioIds: projections.availableScenarios,
    selectedHorizon,
  });

  const displayedProjections = simulation.isActive ? simulation.simulatedProjections : projections;

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
          />

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
