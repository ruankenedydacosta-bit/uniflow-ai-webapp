import UniSignatureWave from './UniSignatureWave';
import styles from './ActionConfirmation.module.css';

export default function ActionConfirmation({
  data,
  onConfirm,
  onEdit,
  onCancel,
  isExecuting = false,
  executionError = null,
}) {
  if (!data) return null;
  const { title, rows = [], status = 'pending', editable = true } = data;

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
        {status === 'pending' && isExecuting && (
          <span className={styles.statusProcessing}>Registrando…</span>
        )}
      </div>

      <dl className={styles.rows}>
        {rows.map((row) => (
          <div className={styles.rowItem} key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.emphasis ? styles.emphasisValue : ''}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {executionError && (
        <div className={styles.errorBox}>
          <span className={styles.errorIcon}>!</span>
          <span className={styles.errorText}>{executionError}</span>
        </div>
      )}

      {status === 'pending' && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirm}
            onClick={onConfirm}
            disabled={isExecuting}
          >
            {isExecuting ? 'Registrando…' : 'Confirmar'}
          </button>
          {editable && (
            <button
              type="button"
              className={styles.edit}
              onClick={onEdit}
              disabled={isExecuting}
            >
              Editar
            </button>
          )}
          <button
            type="button"
            className={styles.cancel}
            onClick={onCancel}
            disabled={isExecuting}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
