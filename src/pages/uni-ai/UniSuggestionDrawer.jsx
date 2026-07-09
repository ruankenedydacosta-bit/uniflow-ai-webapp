import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import styles from '../UniAIPage.module.css';

function UniSuggestionDrawer({ open, suggestions, onToggle, onSuggestionClick }) {
  return (
    <section className={styles.suggestionDrawer} aria-label="Sugestões da Uni">
      <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={open}>
        Sugestões
      </Button>

      {open ? (
        <div className={styles.suggestionDrawerGrid}>
          {suggestions.map((suggestion) => (
            <Card
              key={suggestion}
              variant="outline"
              padding="sm"
              interactive
              className={styles.drawerSuggestionCard}
              onClick={() => onSuggestionClick(suggestion)}
            >
              <span>{suggestion}</span>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default UniSuggestionDrawer;
