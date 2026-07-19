import styles from './QuickSuggestions.module.css';

export default function QuickSuggestions({ items, onSelect, variant = 'grid' }) {
  return (
    <div className={variant === 'grid' ? styles.grid : styles.rail} role="list">
      {items.map((item, i) => (
        <button
          key={item.label}
          type="button"
          role="listitem"
          className={styles.chip}
          style={{ animationDelay: `${i * 0.05}s` }}
          onClick={() => onSelect(item)}
        >
          <span className={styles.icon} aria-hidden="true">{item.icon}</span>
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
