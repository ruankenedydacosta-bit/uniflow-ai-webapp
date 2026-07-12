import Badge from '../../components/ui/Badge';
import styles from '../UniAIPage.module.css';

function UniMemoryInfluenceNotice({ influence, error }) {
  if (error) {
    return (
      <div className={styles.memoryInfluenceNotice} role="status">
        <Badge variant="outline" size="sm">Memória indisponível</Badge>
        <p>{error.message}</p>
      </div>
    );
  }

  if (!influence?.explanation || influence.conflicts?.length) return null;

  return (
    <div className={styles.memoryInfluenceNotice} role="status" aria-live="polite">
      <Badge variant="glass" size="sm" dot>Preferência lembrada</Badge>
      <p>{influence.explanation}</p>
    </div>
  );
}

export default UniMemoryInfluenceNotice;
