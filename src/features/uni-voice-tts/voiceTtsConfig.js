// ELEVEN1: configuracao do LADO DO CLIENTE apenas. Voice ID, modelo,
// formato de saida e a API key ficam exclusivamente na Edge Function
// (uni-voice-tts) -- nada disso e configuravel nem lido no frontend.
// MAX_TTS_TEXT_LENGTH espelha o limite real aplicado pela Edge Function,
// para dar feedback imediato ao usuario sem esperar a rede.

export const TTS_FUNCTION_NAME = 'uni-voice-tts';
export const MAX_TTS_TEXT_LENGTH = 600;
export const DEFAULT_TTS_TIMEOUT_MS = 15000;

// BLOCO UNI 2 / BLOCO VOZ 1: o autoplay já fala QUALQUER resposta final
// (curta ou longa; textos longos ganham versão curta via buildSpeechText
// dentro de handleSpeakMessage, sem nunca alterar o texto visível). Este
// limite agora só controla o botão manual "Ouvir resposta" da Home
// (SimplifiedHomeView) para mensagens acima do tamanho -- um replay
// opcional, nunca uma barreira para a narração automática.
export const AUTO_SPEAK_MAX_LENGTH = 300;
