// ELEVEN2: preferencia simples "Permitir voz nas respostas da Uni".
// Persistida apenas localmente (localStorage) -- mesma estrategia segura ja
// usada por app/workspaceContextHintStorage.js e
// features/uni-instant/uniVoiceHintStorage.js: nunca lanca excecao, nunca
// bloqueia a UI se o storage estiver indisponivel (modo privado, quota).
//
// Padrao: HABILITADA por padrao (ausencia de valor salvo == true), mas
// autoplay continua desligado -- esta preferencia so controla se os
// controles de voz aparecem/funcionam, nunca dispara reproducao sozinha.

export const VOICE_PREFERENCE_STORAGE_KEY = 'uniflow.uni-voice-tts.v1.enabled';

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readVoicePreferenceEnabled(storage = getBrowserStorage()) {
  if (!storage) return true;
  try {
    const raw = storage.getItem(VOICE_PREFERENCE_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function writeVoicePreferenceEnabled(enabled, storage = getBrowserStorage()) {
  if (!storage) return;
  try {
    storage.setItem(VOICE_PREFERENCE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Preferencia nao deve interromper a aplicacao se o storage falhar.
  }
}
