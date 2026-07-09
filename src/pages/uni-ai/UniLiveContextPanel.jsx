import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import styles from '../UniAIPage.module.css';

function UniLiveContextPanel({ contextItems, isActive, isRecalculating }) {
  return (
    <aside className={styles.livePanel} aria-label="Painel vivo da Uni">
      <Card variant="glass" padding="lg" className={styles.livePanelCard}>
        <div className={styles.livePanelHeader}>
          <div>
            <Badge variant={isRecalculating ? 'primary' : 'glass'} dot={isRecalculating}>
              {isRecalculating ? 'Recalculando' : 'Contexto vivo'}
            </Badge>
            <h3>Painel da Uni</h3>
          </div>
          <p>{isActive ? 'A resposta atualizou os sinais principais.' : 'Aguardando sua primeira pergunta.'}</p>
        </div>

        <div className={styles.liveMetricList}>
          {contextItems.map((item, index) => (
            <div
              key={item.label}
              className={`${styles.liveMetric} ${isActive ? styles.liveMetricActive : ''}`}
              style={{ '--metric-delay': `${index * 120}ms` }}
            >
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
              <Badge variant={item.variant} size="sm">
                {item.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}

export default UniLiveContextPanel;
