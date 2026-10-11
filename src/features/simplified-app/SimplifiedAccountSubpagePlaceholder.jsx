import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useNavegar } from './movimentoDeTelaContext.js';
import styles from './simplifiedAccount.module.css';

/**
 * ETAPA 4 (Fase 8): placeholder honesto e consistente para as páginas
 * internas de Conta -- nunca uma tela em branco, sempre título + botão
 * voltar + mensagem curta, no mesmo tema visual do resto do app
 * simplificado. A construção completa de cada uma acontece em tarefas
 * futuras, usando as respectivas referências visuais aprovadas.
 */
function SimplifiedAccountSubpagePlaceholder({ title, description }) {
  const navigate = useNavegar();

  function handleBack() {
    navigate(SIMPLIFIED_ROUTES.ACCOUNT);
  }

  return (
    <div className={styles.subpage}>
      <header className={styles.subpageHeader}>
        <button
          type="button"
          className={styles.backButton}
          onClick={handleBack}
          aria-label="Voltar para Conta"
        >
          <BackIcon />
        </button>
        <h1>{title}</h1>
      </header>
      <div className={styles.subpageBody}>
        <p>{description}</p>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

export default SimplifiedAccountSubpagePlaceholder;
