import styles from './WorkspaceContextNotice.module.css';

/**
 * Aviso curto sobre o contexto PF/PJ ativo (UX5/AUTH3). Reaproveitado em três
 * cenários que compartilham a mesma necessidade -- comunicar algo sobre o
 * espaço ativo sem bloquear a navegação:
 *  1. Explicação a primeira vez que o usuário troca de espaço (dispensável,
 *     sem ação);
 *  2. Aviso ao ser redirecionado de uma rota empresarial em PF (dispensável,
 *     com ação "Ir para Espaço Empresa");
 *  3. Indicador transitório "Alterando para Espaço X…" enquanto uma troca
 *     está em andamento (AUTH3) -- sem botão de dispensar, já que some
 *     sozinho assim que a troca resolve (sucesso ou falha).
 * Nenhum modal, nenhum toast novo -- um só componente pequeno, nunca
 * dependente apenas de timeout para sumir quando é dispensável.
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
        {onDismiss ? (
          <button type="button" className={styles.dismissButton} onClick={onDismiss} aria-label="Dispensar aviso">
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default WorkspaceContextNotice;
