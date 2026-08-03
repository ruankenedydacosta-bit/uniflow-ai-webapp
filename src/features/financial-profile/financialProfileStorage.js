import {
  DEFAULT_FINANCIAL_PROFILE,
  FINANCIAL_PROFILE_STORAGE_KEY,
  isFinancialProfile,
} from './financialProfileConstants.js';

function getBrowserStorage() {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readFinancialProfile(storage = getBrowserStorage()) {
  if (!storage) return DEFAULT_FINANCIAL_PROFILE;

  try {
    const storedProfile = storage.getItem(FINANCIAL_PROFILE_STORAGE_KEY);
    return isFinancialProfile(storedProfile) ? storedProfile : DEFAULT_FINANCIAL_PROFILE;
  } catch {
    return DEFAULT_FINANCIAL_PROFILE;
  }
}

export function writeFinancialProfile(profile, storage = getBrowserStorage()) {
  if (!storage || !isFinancialProfile(profile)) return false;

  try {
    storage.setItem(FINANCIAL_PROFILE_STORAGE_KEY, profile);
    return true;
  } catch {
    return false;
  }
}
