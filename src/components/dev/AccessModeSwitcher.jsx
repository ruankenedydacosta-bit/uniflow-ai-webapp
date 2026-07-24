import { useEffect, useRef, useState } from 'react';
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

// Temporario para desenvolvimento; futuramente sera substituido por um
// seletor de plano real. UX3: nao exibe mais nome/e-mail do usuario --
// identidade agora e responsabilidade exclusiva do AccountMenu (Topbar),
// evitando duas fontes concorrentes de "quem sou eu" na mesma barra.
function AccessModeSwitcher() {
  const { access, setAccess } = useAccess();
  const [isOpen, setIsOpen] = useState(false);
  const switcherRef = useRef(null);
  const canChooseWorkspace = access.userMode === USER_MODES.BOTH;
  const userModeOptions = getModeOptionsForPlan(access.plan);
  const accessSummary = `${USER_MODE_LABELS[access.userMode]} · ${PLAN_LABELS[access.plan]}`;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!switcherRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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
    <div className={styles.switcher} ref={switcherRef}>
      <button
        type="button"
        className={styles.profileButton}
        aria-expanded={isOpen}
        aria-controls="access-demo-panel"
        aria-label={`Contexto de acesso: ${accessSummary}`}
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
      >
        <span className={styles.profileSummary}>{accessSummary}</span>
      </button>

      {isOpen ? (
        <aside id="access-demo-panel" className={styles.panel} aria-label="Seletor temporário de acesso demo">
          <div className={styles.header}>
            <span className={styles.kicker}>Perfil de teste</span>
            <span className={styles.description}>Ambiente temporário de desenvolvimento</span>
          </div>

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
      ) : null}
    </div>
  );
}

export default AccessModeSwitcher;
