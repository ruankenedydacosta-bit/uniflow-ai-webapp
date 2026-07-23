import {
  DEFAULT_THEME,
  SYSTEM_THEME_QUERY,
  THEME_IDS,
  normalizeThemePreference,
} from './themeConstants.js';

export function resolveSystemTheme(matchMedia = globalThis.matchMedia) {
  if (typeof matchMedia !== 'function') return DEFAULT_THEME;

  try {
    return matchMedia(SYSTEM_THEME_QUERY).matches ? THEME_IDS.DARK : THEME_IDS.LIGHT;
  } catch {
    return DEFAULT_THEME;
  }
}

export function resolveEffectiveTheme(preference, systemTheme = DEFAULT_THEME) {
  const normalizedPreference = normalizeThemePreference(preference);
  if (normalizedPreference !== THEME_IDS.SYSTEM) return normalizedPreference;
  return systemTheme === THEME_IDS.DARK ? THEME_IDS.DARK : THEME_IDS.LIGHT;
}

export function subscribeToSystemTheme(onChange, matchMedia = globalThis.matchMedia) {
  if (typeof onChange !== 'function' || typeof matchMedia !== 'function') return () => {};

  let mediaQueryList;
  try {
    mediaQueryList = matchMedia(SYSTEM_THEME_QUERY);
  } catch {
    return () => {};
  }

  const handleChange = (event) => {
    onChange(event.matches ? THEME_IDS.DARK : THEME_IDS.LIGHT);
  };

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }

  mediaQueryList.addListener?.(handleChange);
  return () => mediaQueryList.removeListener?.(handleChange);
}

export function applyThemeToRoot(root, preference, effectiveTheme) {
  if (!root?.setAttribute) return;

  const selectedTheme = normalizeThemePreference(preference);
  const resolvedTheme = resolveEffectiveTheme(selectedTheme, effectiveTheme);
  root.setAttribute('data-theme', resolvedTheme);
  root.setAttribute('data-theme-preference', selectedTheme);
}
