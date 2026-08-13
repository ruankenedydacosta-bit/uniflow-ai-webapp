import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useReports } from '../hooks/useReports.js';
import EvolutionChart from './relatorios/EvolutionChart.jsx';
import styles from './ReportsPage.module.css';

function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function ReportsPage() {
  const { access } = useAccess();
  const workspaceLabel = access.currentWorkspace === WORKSPACE_TYPES.PERSONAL ? 'Pessoal' : 'Empresarial';

  const { isLoading, error, snapshot, hasData, refresh } = useReports();

  const hasComparison = snapshot.monthlySeries.length >= 2;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="relatorios-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {workspaceLabel}
          </Badge>
          <h2 id="relatorios-title">Relatórios</h2>
          <p>Evolução financeira com base nas suas transações reais.</p>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" disabled title="Disponível em breve.">
            Perguntar à Uni
          </Button>
        </div>
      </section>

      {isLoading ? (
        <div className={styles.focusGrid} aria-hidden="true">
          <Card variant="glass" padding="lg" className={styles.skeletonCard} />
          <Card variant="outline" padding="lg" className={styles.skeletonCard} />
        </div>
      ) : error ? (
        <Card padding="lg" role="alert" className={styles.errorCard}>
          <p>Não foi possível carregar os relatórios.</p>
          <p className={styles.errorDetail}>{error.message || 'Erro desconhecido'}</p>
          <Button variant="secondary" size="sm" onClick={refresh}>
            Tentar novamente
          </Button>
        </Card>
      ) : !hasData ? (
        <Card padding="lg" role="status" className={styles.emptyCard}>
          <p className={styles.emptyTitle}>Nenhuma transação encontrada</p>
          <p>
            Para gerar relatórios, precisamos de entradas e saídas registradas.
            Adicione movimentações no Financeiro para começar.
          </p>
        </Card>
      ) : (
        <>
          <section className={styles.focusGrid} aria-label="Evolução financeira">
            <Card variant="glass" padding="lg" className={styles.evolutionCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.eyebrow}>Últimos {snapshot.averages.monthsWithData} meses</span>
                  <h3>Evolução financeira</h3>
                </div>
                <Badge variant="success" size="sm" dot>Dados confirmados</Badge>
              </div>

              {!hasComparison ? (
                <p className={styles.comparisonNotice}>
                  Ainda não há meses suficientes para comparar variação — mostrando o único período disponível.
                </p>
              ) : null}

              <EvolutionChart monthlySeries={snapshot.monthlySeries} />
            </Card>

            <Card variant="outline" padding="lg" className={styles.indicatorsCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Indicadores compactos</h3>
                  <p>Três sinais para entender a evolução sem virar planilha.</p>
                </div>
              </div>

              <div className={styles.indicatorList}>
                <div className={styles.indicatorItem}>
                  <span>Variação das saídas</span>
                  <strong>{formatPercent(snapshot.expenseVariation.percentChange)}</strong>
                  <Badge
                    variant={
                      snapshot.expenseVariation.percentChange === null
                        ? 'secondary'
                        : snapshot.expenseVariation.percentChange > 0
                          ? 'warning'
                          : 'success'
                    }
                    size="sm"
                  >
                    {snapshot.expenseVariation.percentChange === null ? 'Sem comparação' : 'Mês a mês'}
                  </Badge>
                </div>

                <div className={styles.indicatorItem}>
                  <span>Progresso dos objetivos</span>
                  <strong>{Math.round(snapshot.goalsProgress.averageProgress)}%</strong>
                  <Badge variant="primary" size="sm">
                    {snapshot.goalsProgress.activeGoalsCount}{' '}
                    {snapshot.goalsProgress.activeGoalsCount === 1 ? 'meta ativa' : 'metas ativas'}
                  </Badge>
                </div>

                <div className={styles.indicatorItem}>
                  <span>Sinais de atenção</span>
                  <strong>{snapshot.attentionSignals.count}</strong>
                  <Badge variant={snapshot.attentionSignals.count > 0 ? 'warning' : 'success'} size="sm">
                    {snapshot.attentionSignals.count > 0 ? 'Revisar' : 'Tudo certo'}
                  </Badge>
                </div>
              </div>
            </Card>
          </section>

          <section className={styles.guidanceGrid} aria-label="Sinais de atenção">
            <Card variant="default" padding="lg" className={styles.patternsCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>Sinais de atenção</h3>
                  <p>Situações identificadas de forma determinística nos seus dados.</p>
                </div>
              </div>

              {snapshot.attentionSignals.reasons.length === 0 ? (
                <p className={styles.noSignals}>Nenhum sinal de atenção no momento.</p>
              ) : (
                <div className={styles.patternList}>
                  {snapshot.attentionSignals.reasons.map((reason) => (
                    <div key={reason} className={styles.patternItem}>
                      <span className={styles.patternDot} aria-hidden="true" />
                      <p>{reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

export default ReportsPage;
