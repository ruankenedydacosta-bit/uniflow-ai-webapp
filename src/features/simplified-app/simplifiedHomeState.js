import { VOICE_CAPTURE_STATES } from '../uni-voice/voiceCaptureReducer.js';

const VOICE_ERROR_STATES = new Set([
  VOICE_CAPTURE_STATES.PERMISSION_DENIED,
  VOICE_CAPTURE_STATES.UNSUPPORTED,
  VOICE_CAPTURE_STATES.NO_SPEECH,
  VOICE_CAPTURE_STATES.LIMIT_EXCEEDED,
  VOICE_CAPTURE_STATES.ERROR,
]);

export const SIMPLIFIED_UNI_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  TRANSCRIBING: 'transcribing',
  INTERPRETING: 'interpreting',
  WAITING_CONFIRMATION: 'waiting_confirmation',
  EXECUTING: 'executing',
  SPEAKING: 'speaking',
  SUCCESS: 'success',
  ERROR: 'error',
});

export function isVoiceErrorState(status) {
  return VOICE_ERROR_STATES.has(status);
}

// HOTFIX (barge-in): decisão pura do que o MESMO gesto de pointerdown/
// touchstart precisa fazer, extraída de beginVoiceCapture (SimplifiedHomeView)
// para ser testável sem renderizar o componente. Nunca decide sozinha --
// quem chama ainda executa voiceController.stop()/voiceInput.start() na
// ordem indicada, sem esperar um novo evento do usuário.
//
// - isInteractionBusy (digitando/executando/permissão do microfone em
//   voo): o gesto inteiro é recusado -- não interrompe fala nem inicia
//   captura, para não brigar com uma ação já em andamento.
// - isSpeaking: a fala precisa ser interrompida ANTES da captura começar
//   (barge-in) -- mas a captura começa no mesmo gesto, nunca exige soltar
//   e apertar de novo.
export function resolveBargeInPlan({ isInteractionBusy, isSpeaking, isVoiceError } = {}) {
  if (isInteractionBusy) {
    return Object.freeze({ proceed: false, interruptSpeech: false, resetError: false, startCapture: false });
  }
  return Object.freeze({
    proceed: true,
    interruptSpeech: Boolean(isSpeaking),
    resetError: Boolean(isVoiceError),
    startCapture: true,
  });
}

// Verdadeiro enquanto o microfone está capturando de verdade (ou
// aguardando a permissão para começar) -- nunca depende de mensagens,
// execução ou fala, só do status real de captura.
export function isCapturingVoice(voiceStatus) {
  return voiceStatus === VOICE_CAPTURE_STATES.LISTENING
    || voiceStatus === VOICE_CAPTURE_STATES.REQUESTING_PERMISSION;
}

// BLOCO UNI 2: `isSpeaking` reflete a saída de voz (TTS tocando/gerando),
// nunca a captura. HOTFIX (barge-in): pressionar o botão durante a fala
// interrompe a fala E inicia a captura no mesmo gesto -- voiceController.
// stop() é síncrono e atualiza o status ANTES de voiceInput.start()
// começar, então `isSpeaking` já cai para false no mesmo ciclo de render
// em que a captura começa (nunca fica "preso" mostrando SPEAKING por cima
// de uma gravação já em andamento).
//
// HOTFIX FINAL (feedback visual pós barge-in): captura ativa (isCapturing)
// tem PRIORIDADE MÁXIMA sobre confirmação pendente/execução/fala/digitação
// -- antes dessa mudança, uma confirmação pendente de um turno anterior
// (hasPendingConfirmation, que só reflete o HISTÓRICO de mensagens e nunca
// é limpa só porque o usuário começou a falar) continuava vencendo
// LISTENING, e o botão ficava preso em "CONFIRME A AÇÃO" sem texto nem
// animação de escuta durante uma captura de barge-in real. `data-state`
// (o texto do botão E o seletor CSS que liga a animação de ondas,
// [data-state="listening"] .uniVoiceLevelRing) vêm DIRETO do valor
// retornado aqui -- então essa reordenação sozinha resolve texto e
// animação ao mesmo tempo, sem precisar de nenhum estado novo.
export function resolveSimplifiedUniState({
  voiceStatus,
  isTyping,
  isExecuting,
  hasPendingConfirmation,
  hasError,
  isSpeaking,
} = {}) {
  if (hasError || isVoiceErrorState(voiceStatus)) return SIMPLIFIED_UNI_STATES.ERROR;
  if (isCapturingVoice(voiceStatus)) return SIMPLIFIED_UNI_STATES.LISTENING;
  if (isExecuting) return SIMPLIFIED_UNI_STATES.EXECUTING;
  if (hasPendingConfirmation) return SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION;
  if (isTyping) return SIMPLIFIED_UNI_STATES.INTERPRETING;
  if (isSpeaking) return SIMPLIFIED_UNI_STATES.SPEAKING;
  if (voiceStatus === VOICE_CAPTURE_STATES.PROCESSING) {
    return SIMPLIFIED_UNI_STATES.TRANSCRIBING;
  }
  if (voiceStatus === VOICE_CAPTURE_STATES.COMPLETED) return SIMPLIFIED_UNI_STATES.SUCCESS;
  return SIMPLIFIED_UNI_STATES.IDLE;
}
