import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { CONVERSATION_MEMORY_STATES } from '../../features/uni-memory-integration';
import styles from '../UniAIPage.module.css';

function UniMemorySuggestionCard({ suggestion, status, onChoose }) {
  if (!suggestion) return null;
  const isSaving = status === CONVERSATION_MEMORY_STATES.SAVING;

  return (
    <section className={styles.memorySuggestion} aria-labelledby="memory-suggestion-title">
      <div>
        <Badge variant="outline" size="sm">Preferência opcional</Badge>
        <p id="memory-suggestion-title">{suggestion.prompt}</p>
      </div>
      <div className={styles.memorySuggestionActions}>
        <Button size="sm" disabled={isSaving} loading={isSaving} onClick={() => onChoose('remember')}>
          Lembrar
        </Button>
        <Button size="sm" variant="outline" disabled={isSaving} onClick={() => onChoose('once')}>
          Só desta vez
        </Button>
        <Button size="sm" variant="ghost" disabled={isSaving} onClick={() => onChoose('cancel')}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}

export default UniMemorySuggestionCard;
