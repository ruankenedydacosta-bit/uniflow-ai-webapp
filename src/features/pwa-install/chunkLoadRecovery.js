// PWA-UPDATE3: "Failed to fetch dynamically imported module"/ChunkLoadError
// -- acontece quando o JS atual em memoria (runtime antigo) tenta buscar um
// chunk com um hash que um deploy mais novo pode ter substituido. Um
// reload puro resolve (index.html do Vercel ja e servido com
// must-revalidate, entao a proxima carga sempre pega o HTML/manifesto de
// chunks atual) -- a unica coisa que falta e DETECTAR esse erro
// especifico e fazer UM reload guardado, nunca um loop.

export const CHUNK_LOAD_RECOVERY_GUARD_KEY = 'uniflow.app-update.chunk-load-recovery';

const CHUNK_LOAD_ERROR_PATTERN = /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/**
 * Reconhece a FORMA do erro (nome OU mensagem) -- nunca assume que
 * qualquer erro de render e um chunk stale. Erros de negocio normais
 * (validacao, rede de outra chamada, etc.) nunca casam com este padrao.
 */
export function isChunkLoadError(error) {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
  return CHUNK_LOAD_ERROR_PATTERN.test(text);
}

function readGuard(storage) {
  try {
    return storage?.getItem(CHUNK_LOAD_RECOVERY_GUARD_KEY) === '1';
  } catch {
    return false;
  }
}

function writeGuard(storage) {
  try {
    storage?.setItem(CHUNK_LOAD_RECOVERY_GUARD_KEY, '1');
  } catch {
    // Sem storage: nao da pra garantir "no maximo uma vez" com seguranca,
    // entao o chamador trata isso como guarda "ja usada" (ver
    // recoverFromChunkLoadError) -- nunca arrisca um loop.
  }
}

/**
 * Recuperacao de UM tiro: se a guarda de sessao ainda nao foi usada,
 * marca-a e recarrega. Se ja foi usada (ou o storage nao esta
 * disponivel), NUNCA recarrega de novo -- devolve o controle para quem
 * chamou (ex.: o ErrorBoundary mostra a UI de fallback normal em vez de
 * insistir).
 *
 * sessionStorage (nao localStorage) de proposito: um chunk stale e um
 * problema desta navegacao/sessao especifica -- uma sessao nova (aba
 * nova, ou o app realmente relancado do zero no iOS) merece uma nova
 * chance, nunca fica "queimada" para sempre por causa de um deploy antigo.
 */
export function recoverFromChunkLoadError({ runtime = globalThis } = {}) {
  const storage = runtime.sessionStorage;
  if (readGuard(storage)) return false;
  writeGuard(storage);
  if (!readGuard(storage)) return false; // storage indisponivel -- nunca arrisca reload sem guarda real
  runtime.location?.reload?.();
  return true;
}
