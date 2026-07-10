import Card from '../../components/ui/Card';
import styles from '../UniAIPage.module.css';

function UniQuickSuggestions({ suggestions, onSuggestionClick }) {
  return (
    <section className={styles.initialSuggestions} aria-labelledby="quick-suggestions-title">
      <div className={styles.initialSuggestionsHeader}>
        <h3 id="quick-suggestions-title">Sugestões da Uni para começar</h3>
        <p>Escolha uma pergunta ou toque no microfone.</p>
      </div>

      <div className={styles.initialSuggestionGrid}>
        {suggestions.map((suggestion) => (
          <Card
            key={suggestion.intent}
            variant="outline"
            padding="sm"
            interactive
            className={styles.initialSuggestionCard}
            onClick={() => onSuggestionClick(suggestion)}
          >
            <span className={styles.initialSuggestionDot} aria-hidden="true" />
            <span className={styles.initialSuggestionTitle}>{suggestion.label}</span>
            <span className={styles.initialSuggestionDescription}>{suggestion.description}</span>
            <span className={styles.initialSuggestionAction}>Iniciar análise</span>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default UniQuickSuggestions;
