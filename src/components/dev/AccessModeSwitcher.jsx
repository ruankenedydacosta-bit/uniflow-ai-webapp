import { PLANS, USER_MODES, WORKSPACE_TYPES } from '../../app/access.js';
import { useAccess } from '../../app/AccessContext';
import styles from './AccessModeSwitcher.module.css';

const USER_MODE_OPTIONS = [
  { label: 'Pessoal', value: USER_MODES.PERSONAL },
  { label: 'Empresarial', value: USER_MODES.BUSINESS },
  { label: 'Pessoal + Empresa', value: USER_MODES.BOTH },
];

const PLAN_OPTIONS = [
  { label: 'Free', value: PLANS.FREE },
  { label: 'Pro', value: PLANS.PRO },
  { label: 'Business', value: PLANS.BUSINESS },
];

const WORKSPACE_OPTIONS = [
  { label: 'Pessoal', value: WORKSPACE_TYPES.PERSONAL },
  { label: 'Empresarial', value: WORKSPACE_TYPES.BUSINESS },
];

const PERSONAL_PLANS = [PLANS.FREE, PLANS.PRO];
const USER_MODE_LABELS = Object.fromEntries(USER_MODE_OPTIONS.map((option) => [option.value, option.label]));
const PLAN_LABELS = Object.fromEntries(PLAN_OPTIONS.map((option) => [option.value, option.label]));

function getWorkspaceForMode(userMode, currentWorkspace) {
  if (userMode === USER_MODES.PERSONAL) {
    return WORKSPACE_TYPES.PERSONAL;
  }

  if (userMode === USER_MODES.BUSINESS) {
    return WORKSPACE_TYPES.BUSINESS;
  }

  return currentWorkspace;
}

function getModeOptionsForPlan(plan) {
  if (PERSONAL_PLANS.includes(plan)) {
    return USER_MODE_OPTIONS.filter((option) => option.value === USER_MODES.PERSONAL);
  }

  return USER_MODE_OPTIONS.filter((option) => option.value !== USER_MODES.PERSONAL);
}

function normalizeAccessForPlan(plan) {
  if (PERSONAL_PLANS.includes(plan)) {
    return {
      userMode: USER_MODES.PERSONAL,
      currentWorkspace: WORKSPACE_TYPES.PERSONAL,
    };
  }

  return {
    userMode: USER_MODES.BUSINESS,
    currentWorkspace: WORKSPACE_TYPES.BUSINESS,
  };
}

// Temporario para desenvolvimento; sera substituido por onboarding/login e dados reais.
function AccessModeSwitcher() {
  const { access, setAccess } = useAccess();
  const canChooseWorkspace = access.userMode === USER_MODES.BOTH;
  const userModeOptions = getModeOptionsForPlan(access.plan);

  function handleUserModeChange(event) {
    const nextUserMode = event.target.value;

    setAccess((currentAccess) => ({
      ...currentAccess,
      userMode: nextUserMode,
      currentWorkspace: getWorkspaceForMode(nextUserMode, currentAccess.currentWorkspace),
    }));
  }

  function handlePlanChange(event) {
    const nextPlan = event.target.value;
    const normalizedAccess = normalizeAccessForPlan(nextPlan);

    setAccess((currentAccess) => ({
      ...currentAccess,
      plan: nextPlan,
      ...normalizedAccess,
    }));
  }

  function handleWorkspaceChange(event) {
    const nextWorkspace = event.target.value;

    setAccess((currentAccess) => ({
      ...currentAccess,
      currentWorkspace: nextWorkspace,
    }));
  }

  return (
    <aside className={styles.switcher} aria-label="Seletor temporário de acesso demo">
      <div className={styles.header}>
        <span className={styles.kicker}>Acesso Demo</span>
        <span className={styles.summary}>
          {USER_MODE_LABELS[access.userMode]} / {PLAN_LABELS[access.plan]}
        </span>
      </div>

      <label className={styles.field}>
        <span>Modo de uso</span>
        <select value={access.userMode} onChange={handleUserModeChange}>
          {userModeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Plano</span>
        <select value={access.plan} onChange={handlePlanChange}>
          {PLAN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Espaço atual</span>
        <select value={access.currentWorkspace} onChange={handleWorkspaceChange} disabled={!canChooseWorkspace}>
          {WORKSPACE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}

export default AccessModeSwitcher;
