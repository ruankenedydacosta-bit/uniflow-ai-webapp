import UniSignatureWave from './UniSignatureWave';
import styles from './ActionConfirmation.module.css';

// FASE ESTADOS DE PROCESSAMENTO: `processingLabel` (opcional, default
// "Registrando…") -- alimentado por useUniProcessingMessage('executing',
// { actionKind }) para refletir a ação real (ajuste de saldo, transferência
// etc.) em vez de um rótulo genérico fixo.
export default function ActionConfirmation({
  data,
  onConfirm,
  onEdit,
  onCancel,
  isExecuting = false,
  executionError = null,
  processingLabel = 'Registrando…',
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
        {status === 'expired' && <span className={styles.statusCancel}>Expirado</span>}
        {status === 'pending' && isExecuting && (
          <span className={styles.statusProcessing}>{processingLabel}</span>
        )}
      </div>

      <dl className={styles.rows}>
        {rows.map((row, index) => (
          <div className={styles.rowItem} key={row.key ?? `${row.label}-${index}`}>
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
            {isExecuting ? processingLabel : 'Confirmar'}
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
