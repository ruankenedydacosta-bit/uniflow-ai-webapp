// ELEVEN1: configuracao do LADO DO CLIENTE apenas. Voice ID, modelo,
// formato de saida e a API key ficam exclusivamente na Edge Function
// (uni-voice-tts) -- nada disso e configuravel nem lido no frontend.
// MAX_TTS_TEXT_LENGTH espelha o limite real aplicado pela Edge Function,
// para dar feedback imediato ao usuario sem esperar a rede.

export const TTS_FUNCTION_NAME = 'uni-voice-tts';
export const MAX_TTS_TEXT_LENGTH = 600;
export const DEFAULT_TTS_TIMEOUT_MS = 15000;

// BLOCO UNI 2: limite SÓ para reprodução automática (autoplay) de uma
// resposta -- nunca trunca o texto visível nem o texto enviado ao TTS
// quando o usuário pede manualmente ("Ouvir"). Acima deste tamanho, a
// resposta continua completa na tela e só é falada se o usuário tocar o
// botão manual.
export const AUTO_SPEAK_MAX_LENGTH = 300;
