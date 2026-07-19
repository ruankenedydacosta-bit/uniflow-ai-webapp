import UniAvatar from './UniAvatar';
import QuickSuggestions from './QuickSuggestions';
import styles from './EmptyState.module.css';

export default function EmptyState({ userName, suggestions, onSelect }) {
  return (
    <div className={styles.wrap}>
      <UniAvatar size="lg" />
      <h1 className={styles.greeting}>Olá, {userName}.</h1>
      <p className={styles.question}>O que vamos organizar hoje?</p>
      <QuickSuggestions items={suggestions} onSelect={onSelect} variant="grid" />
    </div>
  );
}
