export const FINANCIAL_PROFILE_STORAGE_KEY = 'uniflow.financial-profile';

export const FINANCIAL_PROFILE_IDS = Object.freeze({
  PF: 'pf',
  PJ: 'pj',
});

export const FINANCIAL_PROFILE_OPTIONS = Object.freeze([
  Object.freeze({ id: FINANCIAL_PROFILE_IDS.PF, label: 'PF', name: 'Pessoal' }),
  Object.freeze({ id: FINANCIAL_PROFILE_IDS.PJ, label: 'PJ', name: 'Empresa' }),
]);

export const DEFAULT_FINANCIAL_PROFILE = FINANCIAL_PROFILE_IDS.PF;
export const FINANCIAL_PROFILE_TRANSITION_MS = 200;
export const FINANCIAL_PROFILE_FADE_MS = FINANCIAL_PROFILE_TRANSITION_MS / 2;

export function isFinancialProfile(value) {
  return Object.values(FINANCIAL_PROFILE_IDS).includes(value);
}

export function normalizeFinancialProfile(value) {
  return isFinancialProfile(value) ? value : DEFAULT_FINANCIAL_PROFILE;
}
