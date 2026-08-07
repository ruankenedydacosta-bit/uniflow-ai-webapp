const attemptedWelcomeKeys = new Set();
// Saudações reivindicadas mas ainda NÃO concluídas (preparando/carregando/
// tocando a voz) -- o autoplay de mensagens só é armado quando este
// conjunto esvazia para a sessão atual (prioridade exclusiva da saudação).
const pendingWelcomeKeys = new Set();
// BUGFIX iOS (saudação perdida ao navegar Home -> outra rota -> Home): o
// erro de autoplay bloqueado (ex.: NotAllowedError no Safari) vivia só em
// useState local de SimplifiedHomeView -- some ao desmontar. Como
// claimWelcomeVoice só libera UMA tentativa automática por sessão, remontar
// a Home perdia o botão "Ouvir saudação" para sempre, sem nenhuma forma de
// tocar a saudação pendente. Persistir o erro aqui (mesmo padrão de Set em
// nível de módulo já usado acima) garante que o botão reapareça sempre que
// a Home for revisitada, até a saudação realmente tocar.
const blockedWelcomeErrors = new Map();

export function buildWelcomeSessionKey(user, session) {
  const userId = typeof user?.id === 'string' ? user.id : '';
  if (!userId) return null;
  // last_sign_in_at é estável durante TODO o login -- expires_at muda a cada
  // TOKEN_REFRESHED silencioso, e uma chave instável faria a saudação repetir
  // ao navegar Home → outra rota → Home depois de um refresh de token.
  const sessionMarker = session?.user?.last_sign_in_at
    ?? session?.expires_at
    ?? 'current';
  return `${userId}:${sessionMarker}`;
}

export function claimWelcomeVoice(key) {
  if (!key || attemptedWelcomeKeys.has(key)) return false;
  attemptedWelcomeKeys.add(key);
  pendingWelcomeKeys.add(key);
  return true;
}

// Chamada quando a fala da saudação termina (onEnded) ou falha (erro) --
// única forma de tirar a chave do conjunto pendente. Sempre chamada depois
// de claimWelcomeVoice retornar true.
export function markWelcomeVoiceSettled(key) {
  if (key) pendingWelcomeKeys.delete(key);
}

// true enquanto a saudação da sessão foi reivindicada e ainda não terminou/
// falhou (ou foi reivindicada e nunca vai tocar por voz desabilitada).
export function isWelcomeVoicePending(key) {
  return Boolean(key) && pendingWelcomeKeys.has(key);
}

export function releaseWelcomeVoice(key) {
  if (key) {
    attemptedWelcomeKeys.delete(key);
    pendingWelcomeKeys.delete(key);
    blockedWelcomeErrors.delete(key);
  }
}

export function resetWelcomeVoiceSessions() {
  attemptedWelcomeKeys.clear();
  pendingWelcomeKeys.clear();
  blockedWelcomeErrors.clear();
}

// Guarda o erro (ex.: autoplay bloqueado) da tentativa que falhou, para que
// a UI possa reoferecer "Ouvir saudação" mesmo depois de a Home remontar.
export function markWelcomeVoiceBlocked(key, error) {
  if (key) blockedWelcomeErrors.set(key, error ?? null);
}

// Chamada quando a saudação finalmente toca com sucesso -- não faz sentido
// continuar oferecendo o retry manual depois disso.
export function clearWelcomeVoiceBlocked(key) {
  if (key) blockedWelcomeErrors.delete(key);
}

export function getWelcomeVoiceBlocked(key) {
  return key ? (blockedWelcomeErrors.get(key) ?? null) : null;
}

