import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  normalizeThemePreference,
} from './themeConstants.js';

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readThemePreference(storage = getBrowserStorage()) {
  if (!storage) return DEFAULT_THEME;

  try {
    return normalizeThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeThemePreference(preference, storage = getBrowserStorage()) {
  const normalizedPreference = normalizeThemePreference(preference);
  if (!storage) return normalizedPreference;

  try {
    storage.setItem(THEME_STORAGE_KEY, normalizedPreference);
  } catch {
    // Preferência visual não deve interromper a aplicação se o storage falhar.
  }

  return normalizedPreference;
}
