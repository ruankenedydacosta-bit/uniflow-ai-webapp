// ELEVEN1: vocabulario formal de estados da geracao/reproducao de voz via
// ElevenLabs -- mesma ideia do AI_STATUS da camada de LLM (uni-llm), mas
// com os estados extras de transporte de audio (playing/paused/stopped)
// que a fundacao de voz precisa.

export const VOICE_TTS_STATUS = Object.freeze({
  UNAVAILABLE: 'unavailable',
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
});

export const VOICE_TTS_ERROR_CODES = Object.freeze({
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT: 'RATE_LIMIT',
  INVALID_TEXT: 'INVALID_TEXT',
  TEXT_TOO_LONG: 'TEXT_TOO_LONG',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  CANCELLED: 'CANCELLED',
  AUDIO_PLAYBACK_ERROR: 'AUDIO_PLAYBACK_ERROR',
});

// Mensagens amigaveis -- nunca revelam detalhe interno/tecnico do provedor.
const ERROR_MESSAGES = Object.freeze({
  [VOICE_TTS_ERROR_CODES.UNAVAILABLE]: 'A geração de voz não está disponível neste ambiente.',
  [VOICE_TTS_ERROR_CODES.NOT_CONFIGURED]: 'A geração de voz ainda não está configurada.',
  [VOICE_TTS_ERROR_CODES.UNAUTHORIZED]: 'Entre novamente para gerar voz.',
  [VOICE_TTS_ERROR_CODES.FORBIDDEN]: 'Você não tem acesso a este recurso de voz.',
  [VOICE_TTS_ERROR_CODES.RATE_LIMIT]: 'Muitas solicitações de voz. Tente novamente em instantes.',
  [VOICE_TTS_ERROR_CODES.INVALID_TEXT]: 'Não foi possível usar este texto para gerar voz.',
  // BLOCO A1: distinto de INVALID_TEXT -- aqui o texto e valido, so longo
  // demais para narrar. Mensagem convida a ler na tela em vez de soar como
  // uma falha tecnica generica.
  [VOICE_TTS_ERROR_CODES.TEXT_TOO_LONG]: 'Essa resposta é longa -- prefiro te mostrar na tela.',
  [VOICE_TTS_ERROR_CODES.TIMEOUT]: 'A geração de voz demorou demais. Tente novamente.',
  [VOICE_TTS_ERROR_CODES.NETWORK]: 'Não foi possível conectar ao serviço de voz agora.',
  [VOICE_TTS_ERROR_CODES.PROVIDER_ERROR]: 'Não consegui gerar a voz agora.',
  [VOICE_TTS_ERROR_CODES.CANCELLED]: 'Geração cancelada.',
  [VOICE_TTS_ERROR_CODES.AUDIO_PLAYBACK_ERROR]: 'Não foi possível reproduzir este áudio.',
});

export function getVoiceTtsErrorMessage(code) {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES[VOICE_TTS_ERROR_CODES.PROVIDER_ERROR];
}
