import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { ThemeContext } from './ThemeContext.js';
import { THEME_IDS, normalizeThemePreference } from './themeConstants.js';
import {
  applyThemeToRoot,
  resolveEffectiveTheme,
  resolveSystemTheme,
  subscribeToSystemTheme,
} from './themeResolver.js';
import { readThemePreference, writeThemePreference } from './themeStorage.js';

export function ThemeProvider({ children }) {
  const [selectedTheme, setSelectedTheme] = useState(readThemePreference);
  const [systemTheme, setSystemTheme] = useState(resolveSystemTheme);
  const effectiveTheme = resolveEffectiveTheme(selectedTheme, systemTheme);

  useEffect(() => {
    if (selectedTheme !== THEME_IDS.SYSTEM) return undefined;
    return subscribeToSystemTheme(setSystemTheme);
  }, [selectedTheme]);

  useLayoutEffect(() => {
    applyThemeToRoot(globalThis.document?.documentElement, selectedTheme, effectiveTheme);
  }, [effectiveTheme, selectedTheme]);

  const setTheme = useCallback((preference) => {
    const normalizedPreference = normalizeThemePreference(preference);
    if (normalizedPreference === THEME_IDS.SYSTEM) setSystemTheme(resolveSystemTheme());
    writeThemePreference(normalizedPreference);
    setSelectedTheme(normalizedPreference);
  }, []);

  const value = useMemo(() => Object.freeze({
    effectiveTheme,
    selectedTheme,
    setTheme,
  }), [effectiveTheme, selectedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
