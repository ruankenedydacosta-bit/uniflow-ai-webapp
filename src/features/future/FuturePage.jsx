import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAccess } from '../../app/AccessContext';
import { SCENARIOS } from './futureConstants';
import { useFutureData } from './useFutureData';
import Button from '../../components/ui/Button';
import FutureHeader from './components/FutureHeader/FutureHeader';
import FutureSummary from './components/FutureSummary/FutureSummary';
import FutureChart from './components/FutureChart/FutureChart';
import FutureScenarios from './components/FutureScenarios/FutureScenarios';
import FutureGoals from './components/FutureGoals/FutureGoals';
import FutureExplanation from './components/FutureExplanation/FutureExplanation';
import styles from './FuturePage.module.css';

export default function FuturePage() {
  const navigate = useNavigate();
  const { access } = useAccess();

  const [selectedHorizon, setSelectedHorizon] = useState(6);
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS.LIKELY);

  const {
    isLoading,
    error,
    projections,
    hasData,
  } = useFutureData({
    selectedScenario,
    selectedHorizon,
  });

  const {
    avgIncome,
    avgExpense,
    monthsWithData,
    scenarioProjections = {},
    goalProjections = [],
    goalSummary,
    chartData = [],
    availableScenarios = [],
  } = projections;

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
