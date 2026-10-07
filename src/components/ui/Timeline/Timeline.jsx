import { cx } from '../../../utils/cx.js';
import styles from './Timeline.module.css';

// Linha do tempo da Home e da Agenda (épico #91). Cada item tem hora,
// título, detalhe opcional, cor (blue, violet ou green) e estado: `next`
// destaca o próximo compromisso e `done` risca o que já passou.
function Timeline({ items, label, className }) {
  return (
    <ol className={cx(styles.timeline, className)} aria-label={label}>
      {items.map((item) => (
        <li
          key={item.id}
          className={styles.item}
          data-tone={item.tone ?? 'blue'}
          data-status={item.status ?? 'default'}
        >
          <span className={styles.marker} aria-hidden="true" />
          <time className={styles.time} dateTime={item.dateTime}>{item.time}</time>
          <div>
            <p className={styles.title}>{item.title}</p>
            {item.detail ? (
              <p className={styles.detail} data-highlight={item.highlightDetail ? 'true' : undefined}>
                {item.detail}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default Timeline;
