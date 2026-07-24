import styles from './WorkspaceContextNotice.module.css';

/**
 * Aviso curto e dispensável sobre o contexto PF/PJ ativo (UX5). Reaproveitado
 * em dois cenários que compartilham a mesma necessidade -- comunicar algo
 * sobre o espaço ativo sem bloquear a navegação:
 *  1. Explicação a primeira vez que o usuário troca de espaço (sem ação);
 *  2. Aviso ao ser redirecionado de uma rota empresarial em PF (com ação
 *     "Ir para Espaço Empresa").
 * Nenhum modal, nenhum toast novo -- um só componente pequeno, sempre
 * dispensável, nunca dependente apenas de sumir sozinho por timeout.
 */
function WorkspaceContextNotice({ message, actionLabel, onAction, onDismiss }) {
  return (
    <div className={styles.notice} role="status" aria-live="polite">
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {actionLabel && onAction ? (
          <button type="button" className={styles.actionButton} onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
        <button type="button" className={styles.dismissButton} onClick={onDismiss} aria-label="Dispensar aviso">
          ×
        </button>
      </div>
    </div>
  );
}

export default WorkspaceContextNotice;
