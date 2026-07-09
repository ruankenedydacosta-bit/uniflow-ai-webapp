import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import styles from '../UniAIPage.module.css';

function UniLiveContextPanel({ contextItems, isActive, isRecalculating }) {
  const visibleSignals = contextItems.slice(0, 3);

  return (
    <aside className={styles.livePanel} aria-label="Sinais usados pela Uni">
      <Card variant="glass" padding="lg" className={styles.livePanelCard}>
        <div className={styles.livePanelHeader}>
          <div>
            <Badge variant={isRecalculating ? 'primary' : 'glass'} dot={isRecalculating}>
              {isRecalculating ? 'Recalculando' : 'Sinais'}
            </Badge>
            <h3>Sinais usados pela Uni</h3>
          </div>
          <p>Dados que ajudaram a orientar esta resposta.</p>
        </div>

        <div className={styles.liveMetricList}>
          {visibleSignals.map((item, index) => (
            <div
              key={item.label}
              className={`${styles.liveMetric} ${isActive ? styles.liveMetricActive : ''}`}
              style={{ '--metric-delay': `${index * 120}ms` }}
            >
              <div className={styles.liveMetricContent}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <div className={styles.liveMetricStatus}>
                  <Badge variant={item.variant} size="sm">
                    {item.status}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}

export default UniLiveContextPanel;
