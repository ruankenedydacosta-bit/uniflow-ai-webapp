import { PhArrowLeftIcon } from './SimplifiedIcons.jsx';
import styles from './simplifiedSubpageHeader.module.css';

// Fase 3 (#90): cabeçalho das telas internas do Mais (seta voltar + título
// 17/500 + ação opcional à direita), como no handoff. As rotas /app/conta/*
// e /app/relatorio não recebem o header do shell, então cada tela monta o
// seu com este componente.
function SimplifiedSubpageHeader({ title, onBack, backLabel = 'Voltar', action }) {
  return (
    <header className={styles.header}>
      <div className={styles.titleGroup}>
        <button type="button" className={styles.backButton} onClick={onBack} aria-label={backLabel}>
          <PhArrowLeftIcon />
        </button>
        <h1 className={styles.title}>{title}</h1>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </header>
  );
}

export default SimplifiedSubpageHeader;
