import { useCallback, useEffect, useState } from 'react';

const isBrowser = typeof window !== 'undefined';

/**
 * useLocalStorageState — estado do React persistido em localStorage,
 * com fallback silencioso quando o storage está indisponível (SSR,
 * modo privado, quota excedida). Primeiro uso real: preferência de
 * Sidebar colapsada sobrevivendo a um reload.
 *
 * Nunca lança: qualquer falha de leitura/escrita apenas mantém o estado
 * em memória para aquela sessão, sem quebrar o componente.
 *
 * @param {string} key
 * @param {*} defaultValue
 * @returns {[*, (next:*|((prev:*)=>*)) => void]}
 */
export function useLocalStorageState(key, defaultValue) {
  const [state, setState] = useState(() => {
    if (!isBrowser) return defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback(
    (next) => {
      setState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        if (isBrowser) {
          try {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          } catch {
            // Quota excedida ou storage bloqueado — segue só em memória.
          }
        }
        return resolved;
      });
    },
    [key]
  );

  // Mantém abas/janelas em sincronia quando o valor muda em outro contexto.
  useEffect(() => {
    if (!isBrowser) return undefined;

    function handleStorage(event) {
      if (event.key !== key) return;
      try {
        setState(event.newValue !== null ? JSON.parse(event.newValue) : defaultValue);
      } catch {
        // Valor externo corrompido — ignora e mantém o estado atual.
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key, defaultValue]);

  return [state, setPersistedState];
}
