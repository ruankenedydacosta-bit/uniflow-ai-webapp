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

export const WORKSPACE_TYPES = {
  PERSONAL: 'personal',
  BUSINESS: 'business',
};

// Temporario para desenvolvimento; sera substituido por dados reais do login/Supabase.
export const DEFAULT_DEMO_ACCESS = {
  userMode: USER_MODES.BUSINESS,
  plan: PLANS.BUSINESS,
  currentWorkspace: WORKSPACE_TYPES.BUSINESS,
};

export function isBusinessMode(userMode) {
  return userMode === USER_MODES.BUSINESS || userMode === USER_MODES.BOTH;
}

export function isPersonalMode(userMode) {
  return userMode === USER_MODES.PERSONAL || userMode === USER_MODES.BOTH;
}

export function canUseBusinessFeatures({ userMode, plan }) {
  return isBusinessMode(userMode) && [PLANS.BUSINESS, PLANS.ENTERPRISE].includes(plan);
}
