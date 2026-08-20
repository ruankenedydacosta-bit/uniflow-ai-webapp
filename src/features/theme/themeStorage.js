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

// UNIFLOW-THEME-2TEMAS: migração automática de usuários existentes. Uma
// preferência salva como 'dark'/'system' (temas removidos) não é mais
// válida -- normalizeThemePreference já cai no fallback (UniFlow) a cada
// leitura, mas aqui a migração é gravada de volta, uma única vez, para
// deixar de ser recalculada silenciosamente a cada carregamento e passar a
// ser um fato persistido, igual a qualquer escolha real do usuário.
export function readThemePreference(storage = getBrowserStorage()) {
  if (!storage) return DEFAULT_THEME;

  let raw;
  try {
    raw = storage.getItem(THEME_STORAGE_KEY);
  } catch {
    return DEFAULT_THEME;
  }

  const normalized = normalizeThemePreference(raw);
  if (raw !== null && raw !== normalized) {
    writeThemePreference(normalized, storage);
  }
  return normalized;
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
