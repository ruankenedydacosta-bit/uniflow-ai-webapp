export const THEME_IDS = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  UNIFLOW: 'uniflow',
  SYSTEM: 'system',
});

export const DEFAULT_THEME = THEME_IDS.LIGHT;
export const THEME_STORAGE_KEY = 'uniflow.theme.preference';
export const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

export const THEME_OPTIONS = Object.freeze([
  Object.freeze({ id: THEME_IDS.LIGHT, label: 'Claro' }),
  Object.freeze({ id: THEME_IDS.DARK, label: 'Escuro' }),
  Object.freeze({ id: THEME_IDS.UNIFLOW, label: 'UniFlow' }),
  Object.freeze({ id: THEME_IDS.SYSTEM, label: 'Sistema' }),
]);

const VALID_THEME_IDS = new Set(THEME_OPTIONS.map(({ id }) => id));

export function isThemePreference(value) {
  return typeof value === 'string' && VALID_THEME_IDS.has(value);
}

export function normalizeThemePreference(value) {
  return isThemePreference(value) ? value : DEFAULT_THEME;
}
