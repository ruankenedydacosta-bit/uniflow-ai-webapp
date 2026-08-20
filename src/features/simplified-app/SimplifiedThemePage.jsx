import { useNavigate } from 'react-router-dom';
import { THEME_IDS, THEME_OPTIONS, useTheme } from '../theme/index.js';
import { CheckIcon, SparkleIcon, UniMark } from './SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedTheme.module.css';

const THEME_PRESENTATION = Object.freeze({
  [THEME_IDS.LIGHT]: Object.freeze({
    description: 'Visual claro, leve e confortável para ambientes iluminados.',
  }),
  [THEME_IDS.UNIFLOW]: Object.freeze({
    description: 'A identidade premium da Uni, com azul, violeta e verde da marca.',
    badge: 'Identidade Uni',
  }),
});

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function SimplifiedThemePage() {
  const navigate = useNavigate();
  const { selectedTheme, setTheme } = useTheme();

  return (
    <div className={styles.page} data-simplified-theme data-selected-theme={selectedTheme}>
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
          <h1>Tema</h1>
          <p>Escolha como a UniFlow aparece neste dispositivo.</p>
        </div>
      </header>

      <section className={styles.uniIdentity} aria-label="Identidade visual da Uni">
        <span className={styles.uniMark} aria-hidden="true"><UniMark /></span>
        <span className={styles.identityCopy}>
          <span className={styles.identityLabel}>
            <SparkleIcon />
            Identidade visual da Uni
          </span>
          <strong>Uma experiência que combina com você.</strong>
          <small>A alteração é aplicada e salva automaticamente.</small>
        </span>
      </section>

      <fieldset className={styles.options}>
        <legend>Escolha um tema</legend>
        {THEME_OPTIONS.map((option) => {
          const presentation = THEME_PRESENTATION[option.id];
          const isSelected = selectedTheme === option.id;

          return (
            <label
              key={option.id}
              className={styles.option}
              data-theme-option={option.id}
              data-selected={isSelected ? 'true' : 'false'}
            >
              <input
                type="radio"
                name="simplified-theme-preference"
                value={option.id}
                checked={isSelected}
                onChange={() => setTheme(option.id)}
                aria-label={`Usar tema ${option.label}`}
              />
              <span className={styles.preview} aria-hidden="true">
                <span className={styles.previewSurface} />
                <span className={styles.previewAccent} />
              </span>
              <span className={styles.optionCopy}>
                <span className={styles.optionTitle}>
                  <strong>{option.label}</strong>
                  {presentation.badge ? <small>{presentation.badge}</small> : null}
                </span>
                <span>{presentation.description}</span>
              </span>
              <span className={styles.selectionMark} aria-hidden="true">
                {isSelected ? <CheckIcon /> : null}
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className={styles.savedStatus} role="status" aria-live="polite">
        Tema selecionado: {THEME_OPTIONS.find(({ id }) => id === selectedTheme)?.label}.
      </p>
    </div>
  );
}

export default SimplifiedThemePage;
