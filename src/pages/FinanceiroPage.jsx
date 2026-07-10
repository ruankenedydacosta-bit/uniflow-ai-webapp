import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { formatCurrency } from '../utils/formatters';
import { financialMock } from './financeiro/financial.mock.js';
import styles from './FinanceiroPage.module.css';

const toneClasses = {
  success: styles.toneSuccess,
  primary: styles.tonePrimary,
  warning: styles.toneWarning,
};

function getFinancialContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? financialMock.personal : financialMock.business;
}

function FinanceiroPage() {
  const { access } = useAccess();
  const financial = getFinancialContext(access.currentWorkspace);

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

      <section className={styles.clarityGrid} aria-label="Clareza financeira">
        <Card variant="glass" padding="lg" className={styles.directionCard}>
          <div className={styles.cardHeader}>
            <span>Clareza financeira</span>
            <Badge variant="success" size="sm" dot>
              {financial.clarity.status}
            </Badge>
          </div>
          <strong>{financial.clarity.direction}</strong>
          <p>{financial.clarity.changed}</p>
        </Card>

        <Card variant="outline" padding="lg" className={styles.nextStepCard}>
          <span className={styles.eyebrow}>Próximo passo sugerido</span>
          <strong>{financial.clarity.nextStep}</strong>
          <div className={styles.nextActions}>
            <Button size="sm">Nova entrada</Button>
            <Button variant="outline" size="sm">
              Nova saída
            </Button>
          </div>
        </Card>
      </section>

      <section className={styles.summarySection} aria-labelledby="financeiro-summary-title">
        <div className={styles.sectionTitle}>
          <div>
            <h3 id="financeiro-summary-title">Resumo do mês</h3>
            <p>Dados mockados organizados para virar decisão, não apenas relatório.</p>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          {financial.summary.map((item, index) => (
            <Card
              key={item.label}
              variant={index === 0 ? 'glass' : 'default'}
              padding="lg"
              className={styles.summaryCard}
            >
              <div className={styles.cardHeader}>
                <span>{item.label}</span>
                <Badge variant={item.badgeVariant} size="sm">
                  {item.badge}
                </Badge>
              </div>
              <strong className={cx(styles.metric, toneClasses[item.tone])}>{formatCurrency(item.value)}</strong>
              <p className={styles.detail}>{item.detail}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.contentGrid} aria-label="Fluxo de caixa e movimentações">
        <Card variant="outline" padding="lg" className={styles.cashflowCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Fluxo de caixa</h3>
              <p>Uma rota simples do presente para os próximos dias.</p>
            </div>
            <Badge variant="secondary" size="sm">
              Projetado
            </Badge>
          </div>

          <div className={styles.cashflowList}>
            {financial.cashflow.map((item, index) => (
              <div key={item.label} className={styles.cashflowItem}>
                <div className={styles.cashflowMarker} aria-hidden="true">
                  <span className={index === financial.cashflow.length - 1 ? styles.markerActive : undefined} />
                </div>
                <div>
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="outline" padding="lg">
          <div className={styles.sectionHeader}>
            <div>
              <h3>Movimentações recentes</h3>
              <p>Eventos que alimentam a leitura financeira deste espaço.</p>
            </div>
            <Badge variant="primary" size="sm">
              Mock
            </Badge>
          </div>

          <div className={styles.list}>
            {financial.movements.map((movement) => (
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

      <section className={styles.guidanceGrid} aria-label="Orientação financeira">
        <Card variant="glass" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>Uma leitura calma sobre o que os dados indicam agora.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <p>{financial.uniReading}</p>
          <Button variant="outline" size="sm">
            Perguntar à Uni
          </Button>
        </Card>

        <Card variant="default" padding="lg" className={styles.attentionCard}>
          <span className={styles.eyebrow}>O que merece atenção</span>
          <strong>{financial.clarity.attention}</strong>
          <p>Sem urgência artificial. A ideia é ajustar cedo, com clareza.</p>
        </Card>
      </section>
    </div>
  );
}

export default FinanceiroPage;
