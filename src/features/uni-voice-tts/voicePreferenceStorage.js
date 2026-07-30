// ELEVEN2: preferencia simples "Permitir voz nas respostas da Uni".
// Persistida apenas localmente (localStorage) -- mesma estrategia segura ja
// usada por app/workspaceContextHintStorage.js e
// features/uni-instant/uniVoiceHintStorage.js: nunca lanca excecao, nunca
// bloqueia a UI se o storage estiver indisponivel (modo privado, quota).
//
// Padrao: HABILITADA por padrao (ausencia de valor salvo == true). BLOCO
// UNI 2: esta e a MESMA preferencia que agora tambem controla o autoplay
// da resposta atual da Uni em Home/`/app/uni` (ver o efeito em
// UniChatPage.jsx) -- nao existe uma segunda preferencia separada para
// autoplay; desabilitar aqui desliga tanto os controles manuais quanto a
// reproducao automatica.

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
