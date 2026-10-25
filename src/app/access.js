export const USER_MODES = {
  PERSONAL: 'personal',
  BUSINESS: 'business',
  BOTH: 'both',
};

export const PLANS = {
  FREE: 'free',
  PRO: 'pro',
  BUSINESS: 'business',
  ENTERPRISE: 'enterprise',
};

// FONTE UNICA das capacidades liberadas por plano. Regras de contexto PF/PJ
// continuam em moduleAccess.js; esta matriz trata apenas de capacidades de
// produto que variam conforme a assinatura.
export const PLAN_CAPABILITIES = Object.freeze({
  [PLANS.FREE]: Object.freeze({ reports: false, businessFeatures: false }),
  [PLANS.PRO]: Object.freeze({ reports: true, businessFeatures: false }),
  [PLANS.BUSINESS]: Object.freeze({ reports: true, businessFeatures: true }),
  [PLANS.ENTERPRISE]: Object.freeze({ reports: true, businessFeatures: true }),
});

export const PLAN_IDS = Object.freeze(Object.keys(PLAN_CAPABILITIES));

export function getPlansWithCapability(capability) {
  if (!capability) return [];
  return PLAN_IDS.filter((plan) => PLAN_CAPABILITIES[plan][capability] === true);
}

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
};

const VALID_USER_MODES = Object.values(USER_MODES);
const VALID_PLANS = Object.values(PLANS);
const VALID_WORKSPACE_TYPES = Object.values(WORKSPACE_TYPES);

/**
 * FONTE DE VERDADE — mapeia a sessão real (profile + workspace + subscription do
 * SessionContext) para o shape público de `access`. É a ÚNICA função autorizada a
 * produzir `access.currentWorkspace` a partir de dados autenticados: o tipo PF/PJ
 * deriva sempre de `workspace.workspace_type`, nunca de estado paralelo.
 */
export function getAccessFromSession(profile, workspace, subscription) {
  const currentWorkspace = VALID_WORKSPACE_TYPES.includes(workspace?.workspace_type)
    ? workspace.workspace_type
    : WORKSPACE_TYPES.PERSONAL;
  const userMode = VALID_USER_MODES.includes(profile?.user_mode)
    ? profile.user_mode
    : currentWorkspace === WORKSPACE_TYPES.BUSINESS
      ? USER_MODES.BUSINESS
      : USER_MODES.PERSONAL;
  const fallbackPlan =
    currentWorkspace === WORKSPACE_TYPES.BUSINESS ? PLANS.BUSINESS : PLANS.FREE;
  const plan = VALID_PLANS.includes(subscription?.plan_id)
    ? subscription.plan_id
    : fallbackPlan;

  return { userMode, plan, currentWorkspace };
}

export function isBusinessMode(userMode) {
  return userMode === USER_MODES.BUSINESS || userMode === USER_MODES.BOTH;
}

export function isPersonalMode(userMode) {
  return userMode === USER_MODES.PERSONAL || userMode === USER_MODES.BOTH;
}

export function canUseBusinessFeatures({ userMode, plan }) {
  return isBusinessMode(userMode) && PLAN_CAPABILITIES[plan]?.businessFeatures === true;
}
