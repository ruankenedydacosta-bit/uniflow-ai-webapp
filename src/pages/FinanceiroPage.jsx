import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { formatCurrency } from '../utils/formatters';
import { financialMock } from './financeiro/financial.mock.js';
import styles from './FinanceiroPage.module.css';

function getFinancialContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? financialMock.personal : financialMock.business;
}

function FinanceiroPage() {
  const { access } = useAccess();
  const financial = getFinancialContext(access.currentWorkspace);
  const maxCashflowValue = Math.max(...financial.cashflow.map((item) => item.value));
  const recentMovements = financial.movements.slice(0, 3);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="financeiro-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {financial.workspaceLabel}
          </Badge>
          <h2 id="financeiro-title">Financeiro</h2>
          <p>{financial.subtitle}</p>
        </div>

        <div className={styles.actions}>
          <Button>Registrar por voz</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.focusGrid} aria-label="GPS financeiro">
        <Card variant="glass" padding="lg" className={styles.directionCard}>
          <div className={styles.cardHeader}>
            <span>Clareza financeira</span>
            <Badge variant="success" size="sm" dot>
              {financial.clarity.status}
            </Badge>
          </div>
          <strong>{financial.clarity.direction}</strong>
          <p>{financial.clarity.changed}</p>

          <div className={styles.cashflowChart} aria-label="Projeção de fluxo de caixa">
            {financial.cashflow.map((item) => (
              <div key={item.label} className={styles.chartColumn}>
                <div className={styles.chartTrack}>
                  <span style={{ height: `${Math.max((item.value / maxCashflowValue) * 100, 18)}%` }} />
                </div>
                <div>
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="outline" padding="lg" className={styles.signalsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>O que mudou</h3>
              <p>Três sinais suficientes para decidir sem ruído.</p>
            </div>
          </div>

          <div className={styles.signalList}>
            {financial.signals.map((signal) => (
              <div key={signal.label} className={styles.signalItem}>
                <span className={cx(styles.signalDot, styles[signal.tone])} aria-hidden="true" />
                <div>
                  <strong>{signal.label}</strong>
                  <p>{signal.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className={styles.guidanceGrid} aria-label="Orientação financeira">
        <Card variant="glass" padding="lg" className={styles.nextStepCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Próximo passo</h3>
              <p>Uma ação simples para manter a rota sem esforço extra.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <strong>{financial.clarity.nextStep}</strong>
        </Card>

        <Card variant="default" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>O que os dados indicam agora.</p>
            </div>
          </div>
          <p>{financial.uniReading}</p>
        </Card>
      </section>

      <section className={styles.movementsSection} aria-label="Movimentações recentes">
        <Card variant="outline" padding="lg">
          <div className={styles.sectionHeader}>
            <div>
              <h3>Movimentações recentes</h3>
              <p>Últimos eventos usados para alimentar a leitura da Uni.</p>
            </div>
          </div>
          <div className={styles.list}>
            {recentMovements.map((movement) => (
              <div key={movement.id} className={styles.movementRow}>
                <div className={styles.movementMain}>
                  <strong>{movement.description}</strong>
                  <span className={styles.movementMeta}>
                    {movement.category} · {movement.date}
                  </span>
                </div>
                <span className={cx(styles.amount, movement.type === 'entrada' ? styles.amountEntrada : styles.amountSaida)}>
                  {movement.type === 'entrada' ? '+' : '-'}
                  {formatCurrency(movement.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

export default FinanceiroPage;
