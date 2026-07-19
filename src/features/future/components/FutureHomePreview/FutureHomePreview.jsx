import { useNavigate } from 'react-router-dom';
import { useAccess } from '../../../../app/AccessContext';
import Badge from '../../../../components/ui/Badge';
import Button from '../../../../components/ui/Button';
import Card from '../../../../components/ui/Card';
import { useFutureData } from '../../useFutureData';
import { SCENARIOS } from '../../futureConstants';
import { formatCurrency } from '../../../../utils/formatters';
import styles from './FutureHomePreview.module.css';

export default function FutureHomePreview() {
  const navigate = useNavigate();
  const { access } = useAccess();

  const { isLoading, error, projections, hasData } = useFutureData({
    selectedScenario: SCENARIOS.LIKELY,
    selectedHorizon: 6,
  });

  if (isLoading) {
    return (
      <Card variant="outline" padding="md" className={styles.card}>
        <div className={styles.skeletonLine} style={{ width: '140px' }} />
        <div className={styles.skeletonGrid}>
          <div className={styles.skeletonBlock} />
          <div className={styles.skeletonBlock} />
          <div className={styles.skeletonBlock} />
          <div className={styles.skeletonBlock} />
        </div>
        <div className={styles.skeletonLine} style={{ width: '180px' }} />
      </Card>
    );
  }

  if (error) return null;

  if (!hasData) {
    return (
      <Card variant="outline" padding="md" className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.title}>Seu futuro financeiro</h3>
          <Badge variant="secondary" size="sm">{access.currentWorkspace === 'personal' ? 'Pessoal' : 'Empresarial'}</Badge>
        </div>
        <p className={styles.emptyText}>
          Cadastre transações financeiras para ver projeções do seu futuro.
        </p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/financeiro')}>
          Ir para Financeiro
        </Button>
      </Card>
    );
  }

  const likely = projections.scenarioProjections[SCENARIOS.LIKELY] || {};
  const projectedBalance = likely.projectedBalance ?? projections.currentBalance;
  const monthlyResult = likely.monthlyResult ?? projections.netResult;
  const goalSummary = projections.goalSummary || {};
  const viableCount = goalSummary.viable || 0;
  const atRiskCount = (goalSummary.attention || 0) + (goalSummary.unviable || 0);

  return (
    <Card variant="outline" padding="md" className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Seu futuro financeiro</h3>
        <Badge variant="glass" size="sm">{access.currentWorkspace === 'personal' ? 'Pessoal' : 'Empresarial'}</Badge>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Saldo em 6 meses</span>
          <strong className={styles.metricValue}>{formatCurrency(projectedBalance)}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Resultado médio/mês</span>
          <strong className={styles.metricValue} data-positive={monthlyResult >= 0}>
            {formatCurrency(monthlyResult)}
          </strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Metas viáveis</span>
          <strong className={styles.metricValue}>{viableCount}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Metas em atenção/risco</span>
          <strong className={styles.metricValue} data-risk={atRiskCount > 0}>
            {atRiskCount}
          </strong>
        </div>
      </div>

      <div className={styles.footer}>
        <Badge variant="success" size="sm" dot>Cenário provável</Badge>
        <Button variant="ghost" size="sm" rightIcon={<span aria-hidden="true">→</span>} onClick={() => navigate('/futuro')}>
          Ver projeção completa
        </Button>
      </div>
    </Card>
  );
}
