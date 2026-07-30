import { SIMPLIFIED_ROUTES } from '../features/simplified-app/simplifiedRoutes.js';
import { ACCOUNT_SUBROUTES } from '../features/simplified-app/simplifiedAccountRoutes.js';

// BUGFIX (redirecionamento pós-login): o destino padrão pós-auth é a
// experiência simplificada (Pessoal), nunca o shell legado.
//
// MVP FECHAMENTO: rotas legadas (navigationItems -- dashboard, financeiro,
// crm, clientes, projetos, agenda, relatórios, configurações etc.) NUNCA
// mais são um destino "seguro" aqui, mesmo que um `from`/return path antigo
// (state de navegação salvo antes do fechamento do MVP, ou um deep link
// salvo por um usuário antigo) ainda aponte para uma delas -- só rotas da
// experiência simplificada (Home, Registros, Conta e subpáginas) podem ser
// o destino pós-login. Isso fecha o desvio na origem, antes mesmo de
// App.jsx aplicar o próprio guard (defesa em profundidade).
const DEFAULT_RETURN_PATH = SIMPLIFIED_ROUTES.HOME;
const AUTH_RETURN_STORAGE_KEY = 'uniflow.auth.return-to';
const ALLOWED_PATHS = new Set([
  ...Object.values(SIMPLIFIED_ROUTES),
  ...Object.values(ACCOUNT_SUBROUTES).map((subroute) => subroute.path),
]);

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
