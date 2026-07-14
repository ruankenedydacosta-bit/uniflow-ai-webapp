import styles from './MobileContextHeader.module.css';
import { VALID_CONTEXTS } from './mobileContextHeaderSchema.js';

function ContextSegmentedControl({
  activeContext = 'PF',
  availableContexts = VALID_CONTEXTS,
  isLocked = false,
  isLoading = false,
  hasError = false,
  onChange,
}) {
  const safeAvailableContexts = Array.isArray(availableContexts) ? availableContexts : [];
  const contexts = VALID_CONTEXTS.filter((context) => safeAvailableContexts.includes(context));

  return (
    <div
      className={`${styles.segmentedControl} ${hasError ? styles.segmentedError : ''} ${isLoading ? styles.segmentedLoading : ''}`}
      role="group"
      aria-label="Contexto financeiro"
      aria-busy={isLoading}
    >
      {contexts.map((context) => {
        const isActive = context === activeContext;
        const isContextLocked = context === 'PJ' && isLocked;
        return (
          <button
            key={context}
            type="button"
            className={`${styles.segment} ${isActive ? styles.segmentActive : ''} ${isContextLocked ? styles.segmentLocked : ''}`}
            aria-pressed={isActive}
            aria-disabled={isLoading || isContextLocked}
            onClick={() => {
              if (!isLoading && !isActive) onChange?.(context, { locked: isContextLocked });
            }}
          >
            {isActive && isLoading ? <span className={styles.segmentSpinner} aria-hidden="true" /> : null}
            {context}
          </button>
        );
      })}
    </div>
  );
}

export default ContextSegmentedControl;
