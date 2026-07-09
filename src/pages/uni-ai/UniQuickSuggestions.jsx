import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import styles from '../UniAIPage.module.css';

function UniQuickSuggestions({ suggestions, onSuggestionClick }) {
  return (
    <section className={styles.suggestions} aria-labelledby="quick-suggestions-title">
      <div className={styles.sectionHeader}>
        <div>
          <Badge variant="primary" dot>
            Sugestões rápidas
          </Badge>
          <h3 id="quick-suggestions-title">Perguntas que a Uni pode ajudar a organizar</h3>
        </div>
      </div>

      <div className={styles.suggestionGrid}>
        {suggestions.map((suggestion) => (
          <Card
            key={suggestion}
            variant="outline"
            padding="md"
            interactive
            className={styles.suggestionCard}
            onClick={() => onSuggestionClick(suggestion)}
          >
            <span>{suggestion}</span>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default UniQuickSuggestions;
