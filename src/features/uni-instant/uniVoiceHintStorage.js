// Persiste apenas localmente se o usuario ja descobriu o gesto de segurar o
// botao Uni para falar (UX4) -- chave versionada, mesma estrategia segura de
// features/theme/themeStorage.js: nunca lanca excecao, nunca bloqueia a UI
// se o storage estiver indisponivel (modo privado, quota, etc.).

export const UNI_VOICE_HINT_STORAGE_KEY = 'uniflow.uni-voice-hint.v1.seen';

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readUniVoiceHintSeen(storage = getBrowserStorage()) {
  if (!storage) return false;

  try {
    return storage.getItem(UNI_VOICE_HINT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeUniVoiceHintSeen(storage = getBrowserStorage()) {
  if (!storage) return;

  try {
    storage.setItem(UNI_VOICE_HINT_STORAGE_KEY, 'true');
  } catch {
    // Dica de descoberta nao deve interromper a aplicacao se o storage falhar.
  }
}
