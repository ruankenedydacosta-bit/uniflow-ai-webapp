import {
  SYSTEM_THEME_QUERY,
  THEME_IDS,
  normalizeThemePreference,
} from './themeConstants.js';

// "Sistema" só pode resolver para Claro ou Escuro (nunca para a identidade
// UniFlow) -- por isso usa THEME_IDS.LIGHT diretamente aqui, e não
// DEFAULT_THEME (que é UniFlow, o tema de um usuário sem preferência
// salva). São fallbacks semanticamente diferentes.
export function resolveSystemTheme(matchMedia = globalThis.matchMedia) {
  if (typeof matchMedia !== 'function') return THEME_IDS.LIGHT;

  try {
    return matchMedia(SYSTEM_THEME_QUERY).matches ? THEME_IDS.DARK : THEME_IDS.LIGHT;
  } catch {
    return THEME_IDS.LIGHT;
  }
}

export function resolveEffectiveTheme(preference, systemTheme = THEME_IDS.LIGHT) {
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

// Duração do cross-fade entre temas. 320ms fica na faixa em que uma
// transição é percebida como CONTÍNUA (o sistema visual interpola o
// movimento) sem ser percebida como ESPERA: abaixo de ~120ms a troca vira
// um corte seco -- o salto abrupto de luminância dispara resposta de
// sobressalto e força reacomodação pupilar; acima de ~450ms a interface
// começa a parecer lenta e o usuário perde a sensação de resposta direta
// ao próprio toque.
export const THEME_TRANSITION_MS = 320;

// Marca a raiz durante a troca de tema. A transição de cor é cara demais
// para ficar sempre ligada (afetaria todo hover/foco do app), então ela só
// existe dentro desta janela: liga, troca, desliga. Sem isto, mudar de tema
// pisca a tela inteira de uma vez.
export function beginThemeTransition(root, runtime = globalThis) {
  if (!root?.setAttribute) return () => {};

  root.setAttribute('data-theme-transition', 'active');
  const timeout = runtime.setTimeout?.(() => {
    root.removeAttribute?.('data-theme-transition');
  }, THEME_TRANSITION_MS);

  return () => {
    runtime.clearTimeout?.(timeout);
    root.removeAttribute?.('data-theme-transition');
  };
}
