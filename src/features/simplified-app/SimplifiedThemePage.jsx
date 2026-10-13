import { useSession } from '../../app/SessionContext.jsx';
import { cx } from '../../utils/cx.js';
import { THEME_IDS, THEME_OPTIONS, useTheme } from '../theme/index.js';
import { PhCaretRightIcon } from './SimplifiedIcons.jsx';
import SimplifiedSettingsTabs from './SimplifiedSettingsTabs.jsx';
import SimplifiedSubpageHeader from './SimplifiedSubpageHeader.jsx';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_FEATURE_FLAGS } from './simplifiedFeatureFlags.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useNavegar } from './movimentoDeTelaContext.js';
import groups from './simplifiedGroups.module.css';
import styles from './simplifiedTheme.module.css';

// Só os dois temas reais entram na lista (UniFlow e Claro, ver
// themeConstants.js). O handoff lista também Escuro e Automático, que não
// existem no produto.
const THEME_ORDER = Object.freeze([THEME_IDS.LIGHT, THEME_IDS.UNIFLOW]);

/**
 * Fase 3 do redesign (#90): aba "Preferências" da tela 14 Configurações.
 * Continua na rota de Tema e reutiliza exclusivamente o ThemeProvider
 * oficial (useTheme). O grupo Uni traz só o que existe (Voz da Uni, que
 * define o estilo de conversa); as linhas do handoff sem feature por trás
 * (voz nas respostas, animações do botão, notificações) ficam de fora,
 * porque placeholder é promessa vazia (ver simplifiedAccountRoutes.js).
 * "Trocar senha por e-mail" só aparece para quem entra com senha.
 * O grupo Integrações (Google Agenda, épico #98) só aparece com
 * VITE_AGENDA_GOOGLE_ENABLED=true.
 */
function SimplifiedThemePage() {
  const navigate = useNavegar();
  const { selectedTheme, setTheme } = useTheme();
  const { user } = useSession();
  const hasPasswordIdentity = Array.isArray(user?.identities)
    ? user.identities.some((identity) => identity?.provider === 'email')
    : false;
  const options = THEME_ORDER
    .map((id) => THEME_OPTIONS.find((option) => option.id === id))
    .filter(Boolean);
  const selectedLabel = THEME_OPTIONS.find(({ id }) => id === selectedTheme)?.label;

  return (
    <div className={styles.page} data-simplified-theme data-selected-theme={selectedTheme}>
      <SimplifiedSubpageHeader
        title="Configurações"
        onBack={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
        backLabel="Voltar para Mais"
      />

      <SimplifiedSettingsTabs active={ACCOUNT_SUBROUTE_IDS.THEME} />

      <fieldset className={cx(groups.group, styles.options)}>
        <legend className={groups.groupLabel}>Tema</legend>
        {options.map((option) => {
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
              <span className={styles.radio} aria-hidden="true">
                {isSelected ? <span className={styles.radioDot} /> : null}
              </span>
              <span className={styles.optionLabel}>{option.label}</span>
            </label>
          );
        })}
      </fieldset>

      <p className={styles.savedStatus} role="status" aria-live="polite">
        Tema selecionado: {selectedLabel}.
      </p>

      <section className={groups.group} aria-label="Uni">
        <h2 className={groups.groupLabel}>Uni</h2>
        <div className={groups.list}>
          <button
            type="button"
            className={cx(groups.row, groups.rowPlain)}
            onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.VOICE].path)}
          >
            <span className={groups.rowText}>
              <span className={groups.rowTitle}>Preferências da Uni</span>
              <span className={groups.rowSubtitle}>Tom, explicações e alertas</span>
            </span>
            <span className={groups.caret} aria-hidden="true"><PhCaretRightIcon /></span>
          </button>
        </div>
      </section>

      {SIMPLIFIED_FEATURE_FLAGS.googleAgendaEnabled ? (
        <section className={groups.group} aria-label="Integrações">
          <h2 className={groups.groupLabel}>Integrações</h2>
          <div className={groups.list}>
            <button
              type="button"
              className={cx(groups.row, groups.rowPlain)}
              onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR].path)}
            >
              <span className={groups.rowText}>
                <span className={groups.rowTitle}>Google Agenda</span>
                <span className={groups.rowSubtitle}>Conecte a agenda do UniFlow à sua conta Google</span>
              </span>
              <span className={groups.caret} aria-hidden="true"><PhCaretRightIcon /></span>
            </button>
          </div>
        </section>
      ) : null}

      {hasPasswordIdentity ? (
        <section className={groups.group} aria-label="Conta">
          <h2 className={groups.groupLabel}>Conta</h2>
          <div className={groups.list}>
            <button
              type="button"
              className={cx(groups.row, groups.rowPlain)}
              onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SECURITY].path)}
            >
              <span className={groups.rowText}>
                <span className={groups.rowTitle}>Trocar senha por e-mail</span>
                <span className={groups.rowSubtitle}>Você recebe um link para criar uma nova senha</span>
              </span>
              <span className={groups.caret} aria-hidden="true"><PhCaretRightIcon /></span>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default SimplifiedThemePage;
