import { cx } from '../../../utils/cx.js';
import { UniRingOrb } from '../UniRingOrb/index.js';
import styles from './UniCard.module.css';

// Card em que a Uni fala com a pessoa fora da conversa (épico #91):
// cabeçalho com o orb, frase principal, apoio e até duas ações.
function UniCard({
  time,
  title,
  children,
  actions,
  as: Component = 'section',
  className,
  ...props
}) {
  return (
    <Component className={cx(styles.card, className)} {...props}>
      <p className={styles.kicker}>
        <UniRingOrb size={18} />
        <span>{time ? `Uni · ${time}` : 'Uni'}</span>
      </p>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      {children ? <div className={styles.body}>{children}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </Component>
  );
}

export default UniCard;
