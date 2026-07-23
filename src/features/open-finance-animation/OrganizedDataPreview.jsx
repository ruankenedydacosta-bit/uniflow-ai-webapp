import styles from './OpenFinanceConnectionAnimation.module.css';
import { MOCK_CATEGORIES } from './openFinanceAnimationSteps.js';

export default function OrganizedDataPreview({ active = true }) {
  return (
    <div className={styles.categoryGrid} role="list" aria-label="Categorias organizadas automaticamente">
      {MOCK_CATEGORIES.map((category, i) => (
        <span
          key={category.id}
          role="listitem"
          className={styles.categoryChip}
          style={{ animationDelay: active ? `${i * 90}ms` : '0ms' }}
        >
          {category.label}
        </span>
      ))}
    </div>
  );
}
