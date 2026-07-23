import Card from '../../../components/ui/Card';
import { THEME_IDS, THEME_OPTIONS } from '../themeConstants.js';
import { useTheme } from '../useTheme.js';
import styles from './ThemeSelector.module.css';

const THEME_DESCRIPTIONS = Object.freeze({
  [THEME_IDS.LIGHT]: 'Claro suave, superfícies limpas e texto escuro.',
  [THEME_IDS.DARK]: 'Escuro neutro e confortável para uso prolongado.',
  [THEME_IDS.UNIFLOW]: 'Identidade premium com azul, roxo e verde da marca.',
  [THEME_IDS.SYSTEM]: 'Acompanha o modo claro ou escuro do aparelho.',
});

export function ThemeSelector() {
  const { effectiveTheme, selectedTheme, setTheme } = useTheme();

  return (
    <Card variant="default" padding="lg" className={styles.card}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Aparência</legend>
        <p className={styles.description}>Escolha como a UniFlow aparece neste dispositivo.</p>

        <div className={styles.options}>
          {THEME_OPTIONS.map((option) => {
            const isSelected = selectedTheme === option.id;

            return (
              <label
                key={option.id}
                className={styles.option}
                data-selected={isSelected ? 'true' : 'false'}
              >
                <input
                  className={styles.radio}
                  type="radio"
                  name="theme-preference"
                  value={option.id}
                  checked={isSelected}
                  onChange={() => setTheme(option.id)}
                  aria-label={`Usar tema ${option.label}`}
                />

                <span
                  className={styles.preview}
                  data-preview-theme={option.id}
                  aria-hidden="true"
                >
                  <span className={styles.previewSurface} />
                  <span className={styles.previewAccent} />
                </span>

                <span className={styles.copy}>
                  <strong>{option.label}</strong>
                  <span>{THEME_DESCRIPTIONS[option.id]}</span>
                  {isSelected ? <small>Selecionado</small> : null}
                </span>
              </label>
            );
          })}
        </div>

        {selectedTheme === THEME_IDS.SYSTEM ? (
          <p className={styles.systemStatus} role="status">
            Seguindo o sistema: {effectiveTheme === THEME_IDS.DARK ? 'Escuro' : 'Claro'}
          </p>
        ) : null}
      </fieldset>
    </Card>
  );
}
