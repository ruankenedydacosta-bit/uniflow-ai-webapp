const attemptedWelcomeKeys = new Set();
// Saudações reivindicadas mas ainda NÃO concluídas (preparando/carregando/
// tocando a voz) -- o autoplay de mensagens só é armado quando este
// conjunto esvazia para a sessão atual (prioridade exclusiva da saudação).
const pendingWelcomeKeys = new Set();
// Erro de autoplay bloqueado (ex.: NotAllowedError) da tentativa automática.
// Enquanto a Home estiver montada, o próximo toque nela refaz a saudação. A
// Home limpa o erro ao desmontar: a saudação só toca na primeira visita da
// carga da página, e voltar à Home depois de navegar não a repete. No iOS, a
// ativação explícita de voz e microfone evita depender desse autoplay.
const blockedWelcomeErrors = new Map();
const activatedWelcomeKeys = new Set();

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
    activatedWelcomeKeys.delete(key);
  }
}

export function resetWelcomeVoiceSessions() {
  attemptedWelcomeKeys.clear();
  pendingWelcomeKeys.clear();
  blockedWelcomeErrors.clear();
  activatedWelcomeKeys.clear();
}

export function markWelcomeVoiceActivated(key) {
  if (key) activatedWelcomeKeys.add(key);
}

export function isWelcomeVoiceActivated(key) {
  return Boolean(key) && activatedWelcomeKeys.has(key);
}

// Guarda o erro de uma tentativa automática para que o próximo gesto válido
// na Home possa refazê-la.
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
