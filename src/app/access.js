import {
  hasPlanAccess,
  normalizePlanCapabilities,
  PLAN_CAPABILITY,
  PLAN_IDS,
  PLANS,
} from '../../supabase/functions/_shared/planCatalog.js';

export const USER_MODES = {
  PERSONAL: 'personal',
  BUSINESS: 'business',
  BOTH: 'both',
};

export { PLAN_CAPABILITY, PLAN_IDS, PLANS };

export const WORKSPACE_TYPES = {
  PERSONAL: 'personal',
  BUSINESS: 'business',
};

// Modo demo (sem Supabase configurado). Abre SEMPRE em contexto pessoal (PF),
// determinístico e sem simular acesso empresarial por padrão. Uma eventual troca
// para PJ dentro do demo fica contida ao estado do AccessContext (ver AccessContext.jsx),
// nunca lê nem grava a preferência namespaced de um usuário autenticado real.
export const DEFAULT_DEMO_ACCESS = {
  userMode: USER_MODES.PERSONAL,
  plan: PLANS.FREE,
  currentWorkspace: WORKSPACE_TYPES.PERSONAL,
  capabilities: normalizePlanCapabilities([]),
};

const VALID_USER_MODES = Object.values(USER_MODES);
const VALID_PLANS = PLAN_IDS;
const VALID_WORKSPACE_TYPES = Object.values(WORKSPACE_TYPES);

/**
 * FONTE DE VERDADE — mapeia a sessão real (profile + workspace + subscription do
 * SessionContext) para o shape público de `access`. É a ÚNICA função autorizada a
 * produzir `access.currentWorkspace` a partir de dados autenticados: o tipo PF/PJ
 * deriva sempre de `workspace.workspace_type`, nunca de estado paralelo.
 */
export function getAccessFromSession(profile, workspace, subscription, now = new Date()) {
  const currentWorkspace = VALID_WORKSPACE_TYPES.includes(workspace?.workspace_type)
    ? workspace.workspace_type
    : WORKSPACE_TYPES.PERSONAL;
  const userMode = VALID_USER_MODES.includes(profile?.user_mode)
    ? profile.user_mode
    : currentWorkspace === WORKSPACE_TYPES.BUSINESS
      ? USER_MODES.BUSINESS
      : USER_MODES.PERSONAL;
  // Workspace type selects context, not a paid entitlement. Missing or
  // ineligible subscription data must never grant Business capabilities.
  const hasAccessibleSubscription = hasPlanAccess(subscription, now);
  const plan = hasAccessibleSubscription && VALID_PLANS.includes(subscription.plan_id)
    ? subscription.plan_id
    : PLANS.FREE;
  const capabilities = hasAccessibleSubscription && VALID_PLANS.includes(subscription.plan_id)
    ? normalizePlanCapabilities(subscription.capabilities)
    : normalizePlanCapabilities([]);

  return { userMode, plan, currentWorkspace, capabilities };
}

export function isBusinessMode(userMode) {
  return userMode === USER_MODES.BUSINESS || userMode === USER_MODES.BOTH;
}

export function isPersonalMode(userMode) {
  return userMode === USER_MODES.PERSONAL || userMode === USER_MODES.BOTH;
}

export function canUseBusinessFeatures({ userMode, capabilities }) {
  return isBusinessMode(userMode)
    && capabilities?.[PLAN_CAPABILITY.BUSINESS_FEATURES] === true;
}
