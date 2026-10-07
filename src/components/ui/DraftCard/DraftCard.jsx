import { cx } from '../../../utils/cx.js';
import OutlineButton from '../OutlineButton/OutlineButton.jsx';
import styles from './DraftCard.module.css';

// Rascunho que a Uni montou e que só é salvo quando a pessoa confirma
// (épico #91). O card não grava nada: quem usa decide o que cada botão faz.
// `busy` trava os três botões enquanto a confirmação está em andamento, e
// `confirmIcon` vem de quem usa, para o componente base não depender de feature.
function DraftCard({
  kind,
  tag,
  amount,
  details = [],
  onConfirm,
  onEdit,
  onCancel,
  busy = false,
  confirmIcon = null,
  className,
  ...props
}) {
  return (
    <section className={cx(styles.card, className)} {...props}>
      <div className={styles.header}>
        <span className={styles.kind}>{kind}</span>
        {tag ? <span className={styles.tag}>{tag}</span> : null}
      </div>
      <p className={styles.amount}>{amount}</p>
      {details.length > 0 ? (
        <dl className={styles.details}>
          {details.map(({ label, value }) => (
            <div key={label} className={styles.detail}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className={styles.actions}>
        <OutlineButton variant="confirm" className={styles.confirm} onClick={onConfirm} disabled={busy}>
          {confirmIcon}
          Confirmar
        </OutlineButton>
        {onEdit ? (
          <OutlineButton variant="secondary" onClick={onEdit} disabled={busy}>Editar</OutlineButton>
        ) : null}
        <OutlineButton variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</OutlineButton>
      </div>
    </section>
  );
}

export default DraftCard;
