import styles from './ErrorState.module.css';

// SUPORTE1: variant 'cancelled' cobre o cancelamento deliberado do usuario --
// nunca deve parecer uma falha real (sem vermelho, sem icone de alerta, sem
// "tentar novamente", já que o usuário decidiu parar, não algo que precise
// ser corrigido). variant 'error' é o comportamento original, inalterado.
export default function ErrorState({ onRetry, variant = 'error' }) {
  if (variant === 'cancelled') {
    return (
      <p className={styles.cancelledNote} role="status">
        Resposta cancelada.
      </p>
    );
  }

  return (
    <div className={styles.wrap} role="alert">
      <div className={styles.iconWrap}>
        <WarnIcon />
      </div>
      <div className={styles.copy}>
        <p className={styles.title}>A Uni não conseguiu responder agora</p>
        <p className={styles.subtitle}>Verifique sua conexão e tente novamente.</p>
      </div>
      <button type="button" className={styles.retry} onClick={onRetry}>
        Tentar novamente
      </button>
    </div>
  );
}

function WarnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
