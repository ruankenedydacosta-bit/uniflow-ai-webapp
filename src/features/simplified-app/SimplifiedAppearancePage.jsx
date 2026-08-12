import { useNavigate } from 'react-router-dom';
import { THEME_IDS, THEME_OPTIONS, useTheme } from '../theme';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedAppearance.module.css';

// O texto de cada tema descreve QUANDO ele é a melhor escolha, não a cor que
// ele usa -- a cor o usuário já vê na amostra ao lado. Descrever a situação
// ("sol na tela", "à noite") permite decidir por reconhecimento, sem precisar
// aplicar cada tema para descobrir o que ele é.
const THEME_COPY = Object.freeze({
  [THEME_IDS.LIGHT]: {
    description: 'Fundo claro e texto escuro. Melhor leitura com muita luz ambiente ou sol na tela.',
  },
  [THEME_IDS.DARK]: {
    description: 'Cinza-escuro neutro e sem brilho. Confortável à noite e em uso prolongado.',
  },
  [THEME_IDS.UNIFLOW]: {
    description: 'A identidade da marca: azul-noite profundo com azul, roxo e verde da UniFlow.',
  },
  [THEME_IDS.SYSTEM]: {
    description: 'Acompanha o aparelho automaticamente, inclusive na troca de claro para escuro.',
  },
});

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

// Amostra do tema: uma miniatura da própria interface (barra, bloco de saldo,
// duas linhas de texto, acento). É desenhada com as cores REAIS daquele tema,
// não com uma aproximação -- por isso o preview não mente sobre o resultado.
function ThemeSwatch({ themeId }) {
  return (
    <span className={styles.swatch} data-swatch-theme={themeId} aria-hidden="true">
      <span className={styles.swatchBar} />
      <span className={styles.swatchCard}>
        <span className={styles.swatchLineStrong} />
        <span className={styles.swatchLine} />
      </span>
      <span className={styles.swatchAccent} />
    </span>
  );
}

function SimplifiedAppearancePage() {
  const navigate = useNavigate();
  const { effectiveTheme, selectedTheme, setTheme } = useTheme();

  return (
    <div className={styles.page} data-simplified-appearance>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
          aria-label="Voltar para Conta"
        >
          <BackIcon />
        </button>
        <div>
          <h1>Aparência</h1>
          <p>Escolha o tema do aplicativo.</p>
        </div>
      </header>

      <fieldset className={styles.options}>
        <legend>Tema do aplicativo</legend>

        {THEME_OPTIONS.map((option) => {
          const isSelected = selectedTheme === option.id;

          return (
            <label
              key={option.id}
              className={styles.option}
              data-selected={isSelected}
            >
              <input
                type="radio"
                name="simplified-theme-preference"
                value={option.id}
                checked={isSelected}
                onChange={() => setTheme(option.id)}
              />

              <ThemeSwatch themeId={option.id} />

              <span className={styles.optionCopy}>
                <span className={styles.optionTitle}>
                  <strong>{option.label}</strong>
                  {option.id === THEME_IDS.UNIFLOW ? <small>Identidade</small> : null}
                </span>
                <span>{THEME_COPY[option.id].description}</span>
              </span>

              <span className={styles.check} aria-hidden="true">
                <CheckIcon />
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* "Sistema" é a única opção cujo resultado não é visível no próprio
          nome -- dizer para qual tema ele está resolvendo AGORA evita a
          dúvida de "escolhi Sistema, mas qual está valendo?". */}
      {selectedTheme === THEME_IDS.SYSTEM ? (
        <p className={styles.systemStatus} role="status">
          Seguindo o aparelho agora:
          {' '}
          <strong>{effectiveTheme === THEME_IDS.DARK ? 'Escuro' : 'Claro'}</strong>
        </p>
      ) : null}

      <p className={styles.note}>
        A mudança é aplicada na hora e fica salva neste aparelho.
      </p>
    </div>
  );
}

export default SimplifiedAppearancePage;
