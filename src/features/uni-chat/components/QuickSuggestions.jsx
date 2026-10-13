import styles from './QuickSuggestions.module.css';

export default function QuickSuggestions({ items, onSelect, variant = 'grid', label }) {
  return (
    <div className={variant === 'grid' ? styles.grid : styles.rail} role="list" aria-label={label}>
      {items.map((item, i) => (
        <button
          key={item.id ?? item.label}
          type="button"
          role="listitem"
          className={styles.chip}
          style={{ animationDelay: `${i * 0.05}s` }}
          onClick={() => onSelect(item)}
        >
          {item.icon ? <span className={styles.icon} aria-hidden="true">{item.icon}</span> : null}
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
