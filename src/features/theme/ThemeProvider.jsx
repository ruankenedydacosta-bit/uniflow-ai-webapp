import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ThemeContext } from './ThemeContext.js';
import { THEME_IDS, normalizeThemePreference } from './themeConstants.js';
import {
  applyThemeToRoot,
  beginThemeTransition,
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

  // A primeira aplicação é a pintura inicial da página, não uma TROCA: animar
  // ali faria o app nascer fazendo cross-fade a partir do tema errado. O
  // cross-fade só existe a partir da segunda aplicação em diante.
  const hasPaintedRef = useRef(false);

  useLayoutEffect(() => {
    const root = globalThis.document?.documentElement;
    const cancelTransition = hasPaintedRef.current
      ? beginThemeTransition(root)
      : null;
    hasPaintedRef.current = true;

    applyThemeToRoot(root, selectedTheme, effectiveTheme);
    return cancelTransition ?? undefined;
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
