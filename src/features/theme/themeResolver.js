import { normalizeThemePreference } from './themeConstants.js';

// UNIFLOW-THEME-2TEMAS: sem o tema Sistema, a preferência normalizada JÁ É
// o tema efetivo -- nunca depende do dispositivo do usuário. Assinatura de
// um único argumento de propósito: nenhuma chamada precisa (nem pode)
// informar um tema de sistema para resolver contra.
export function resolveEffectiveTheme(preference) {
  return normalizeThemePreference(preference);
}

// data-theme e data-theme-preference sempre coincidem agora (sem Sistema,
// não há mais divergência entre "o que o usuário escolheu" e "o que é
// pintado") -- os dois atributos continuam existindo por estabilidade do
// contrato DOM (nada além desta função os define).
export function applyThemeToRoot(root, preference, effectiveTheme) {
  if (!root?.setAttribute) return;

  const selectedTheme = normalizeThemePreference(preference);
  const resolvedTheme = normalizeThemePreference(effectiveTheme ?? selectedTheme);
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
