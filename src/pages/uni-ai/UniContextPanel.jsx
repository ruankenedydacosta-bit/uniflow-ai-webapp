import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import styles from '../UniAIPage.module.css';

function UniContextPanel({ contextItems }) {
  return (
    <aside className={styles.sideColumn} aria-label="Contexto da Uni">
      <Card variant="glass" padding="lg" className={styles.contextCard}>
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.cardTitle}>Contexto usado pela Uni</span>
            <p>Dados simulados que orientam as respostas nesta etapa.</p>
          </div>
        </div>

        <div className={styles.contextList}>
          {contextItems.map((item) => (
            <div key={item.label} className={styles.contextItem}>
              <div>
                <span className={styles.contextLabel}>{item.label}</span>
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

export default UniContextPanel;
