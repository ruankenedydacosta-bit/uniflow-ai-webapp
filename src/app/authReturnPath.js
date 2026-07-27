import { navigationItems } from './navigation.js';

const DEFAULT_RETURN_PATH = '/dashboard';
const AUTH_RETURN_STORAGE_KEY = 'uniflow.auth.return-to';
const ALLOWED_PATHS = new Set(navigationItems.map((item) => item.path));

export function getSafeAuthReturnPath(value, fallback = DEFAULT_RETURN_PATH) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  try {
    const url = new URL(value, 'https://uniflow.local');
    if (url.origin !== 'https://uniflow.local' || !ALLOWED_PATHS.has(url.pathname)) {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function saveAuthReturnPath(value, storage = globalThis.sessionStorage) {
  const safePath = getSafeAuthReturnPath(value);
  try {
    storage?.setItem(AUTH_RETURN_STORAGE_KEY, safePath);
  } catch {
    // Storage indisponível não pode bloquear autenticação.
  }
  return safePath;
}

export function readAuthReturnPath(storage = globalThis.sessionStorage) {
  try {
    return getSafeAuthReturnPath(storage?.getItem(AUTH_RETURN_STORAGE_KEY));
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}

export function consumeAuthReturnPath(storage = globalThis.sessionStorage) {
  const safePath = readAuthReturnPath(storage);
  try {
    storage?.removeItem(AUTH_RETURN_STORAGE_KEY);
  } catch {
    // O destino já foi validado; falha ao limpar não impede o retorno.
  }
  return safePath;
}
