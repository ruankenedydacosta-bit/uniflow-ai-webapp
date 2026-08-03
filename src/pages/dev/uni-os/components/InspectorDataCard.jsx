import { useState } from 'react';
import Badge from '../../../../components/ui/Badge';
import styles from '../UNIOSInspectorPage.module.css';

function InspectorDataCard({ id, title, eyebrow, status = 'Ready', data, highlights = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const contentId = `${id}-json`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopyState('copied');
    } catch {
      setCopyState('unavailable');
    }
  }

  return (
    <article className={styles.dataCard} data-inspector-card={id}>
      <div className={styles.dataCardHeader}>
        <div>
          <span className={styles.cardEyebrow}>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <Badge variant="success" size="sm" dot>
          {status}
        </Badge>
      </div>

      <dl className={styles.highlightList}>
        {highlights.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.cardActions}>
        <button
          className={styles.cardAction}
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? 'Recolher' : 'Ver JSON'}
        </button>
        <button className={styles.cardAction} type="button" onClick={handleCopy}>
          {copyState === 'copied' ? 'Copiado' : copyState === 'unavailable' ? 'Indisponivel' : 'Copiar JSON'}
        </button>
      </div>

      {isExpanded ? (
        <pre id={contentId} className={styles.jsonPreview} tabIndex="0">
          <code>{JSON.stringify(data, null, 2)}</code>
        </pre>
      ) : null}
    </article>
  );
}

export default InspectorDataCard;
