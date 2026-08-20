import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ThemeContext } from './ThemeContext.js';
import { normalizeThemePreference } from './themeConstants.js';
import {
  applyThemeToRoot,
  beginThemeTransition,
  resolveEffectiveTheme,
} from './themeResolver.js';
import { readThemePreference, writeThemePreference } from './themeStorage.js';

export function ThemeProvider({ children }) {
  const [selectedTheme, setSelectedTheme] = useState(readThemePreference);
  // UNIFLOW-THEME-2TEMAS: sem Sistema, effectiveTheme é sempre igual à
  // preferência normalizada -- nenhum estado/efeito de sistema operacional.
  const effectiveTheme = resolveEffectiveTheme(selectedTheme);

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
