// UNIFLOW-THEME-2TEMAS: a partir desta versão só existem dois temas
// selecionáveis -- UniFlow (identidade oficial da marca) e Claro. Escuro e
// Sistema foram removidos por completo (nunca escondidos): nenhuma lógica
// de resolução de sistema operacional permanece no app (ver
// themeResolver.js). Qualquer preferência salva anteriormente como
// 'dark'/'system' deixa de ser um valor válido e cai automaticamente no
// fallback abaixo (ver normalizeThemePreference) -- é assim que a migração
// automática de usuários existentes acontece, sem nenhum código dedicado.
export const THEME_IDS = Object.freeze({
  LIGHT: 'light',
  UNIFLOW: 'uniflow',
});

// Todo usuário sem preferência salva (ou com uma preferência removida,
// como 'dark'/'system') entra no tema UniFlow (identidade da marca) --
// nunca Claro. Só muda se o próprio usuário escolher Claro em
// Conta > Tema; a escolha fica salva e vale para as próximas visitas.
export const DEFAULT_THEME = THEME_IDS.UNIFLOW;
export const THEME_STORAGE_KEY = 'uniflow.theme.preference';

// UniFlow primeiro (padrão obrigatório da marca), Claro como alternativa
// manual -- mesma ordem em que os dois temas aparecem no seletor.
export const THEME_OPTIONS = Object.freeze([
  Object.freeze({ id: THEME_IDS.UNIFLOW, label: 'UniFlow' }),
  Object.freeze({ id: THEME_IDS.LIGHT, label: 'Claro' }),
]);

const VALID_THEME_IDS = new Set(THEME_OPTIONS.map(({ id }) => id));

export function isThemePreference(value) {
  return typeof value === 'string' && VALID_THEME_IDS.has(value);
}

export function normalizeThemePreference(value) {
  return isThemePreference(value) ? value : DEFAULT_THEME;
}
