import UniSignatureWave from './UniSignatureWave';
import styles from './ActionConfirmation.module.css';

export default function ActionConfirmation({ data, onConfirm, onEdit, onCancel }) {
  if (!data) return null;
  const { title, rows = [], status = 'pending' } = data;

  return (
    <div className={`${styles.card} ${status !== 'pending' ? styles.resolved : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {status === 'confirmed' && (
          <span className={styles.statusOk}>
            <UniSignatureWave variant="success" size={20} /> Confirmado
          </span>
        )}
        {status === 'canceled' && <span className={styles.statusCancel}>Cancelado</span>}
      </div>

      <dl className={styles.rows}>
        {rows.map((row) => (
          <div className={styles.rowItem} key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.emphasis ? styles.emphasisValue : ''}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {status === 'pending' && (
        <div className={styles.actions}>
          <button type="button" className={styles.confirm} onClick={onConfirm}>
            Confirmar
          </button>
          <button type="button" className={styles.edit} onClick={onEdit}>
            Editar
          </button>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
