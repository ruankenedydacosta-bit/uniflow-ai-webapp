import { UNI_RING_ORB_STATES } from '../../components/ui/UniRingOrb/uniRingOrbModel.js';
import { REALTIME_STATUS } from '../uni-voice-realtime/realtimeSessionModel.js';
import { SIMPLIFIED_UNI_STATES } from './simplifiedHomeState.js';

// Tom do status no topo da tela de voz: azul ouvindo, roxo entendendo ou
// falando, verde quando há rascunho para conferir.
export const VOICE_MODE_TONES = Object.freeze({
  NEUTRAL: 'neutral',
  LISTENING: 'listening',
  THINKING: 'thinking',
  READY: 'ready',
  MUTED: 'muted',
  ERROR: 'error',
});

// Ação do botão central (e do toque no orb). Uma ação por estado: nunca
// "parar" e "falar" no mesmo toque.
export const VOICE_MODE_ACTIONS = Object.freeze({
  START: 'start',
  STOP_LISTENING: 'stop_listening',
  STOP_SPEAKING: 'stop_speaking',
  END_CONVERSATION: 'end_conversation',
  NONE: 'none',
});

const VIEW_BY_STATE = Object.freeze({
  [SIMPLIFIED_UNI_STATES.IDLE]: Object.freeze({
    orb: UNI_RING_ORB_STATES.IDLE,
    tone: VOICE_MODE_TONES.NEUTRAL,
    status: 'Toque no orb para falar',
    action: VOICE_MODE_ACTIONS.START,
  }),
  [SIMPLIFIED_UNI_STATES.LISTENING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.LISTENING,
    tone: VOICE_MODE_TONES.LISTENING,
    status: 'Ouvindo',
    action: VOICE_MODE_ACTIONS.STOP_LISTENING,
  }),
  [SIMPLIFIED_UNI_STATES.TRANSCRIBING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.THINKING,
    tone: VOICE_MODE_TONES.THINKING,
    status: 'Entendendo',
    action: VOICE_MODE_ACTIONS.NONE,
  }),
  [SIMPLIFIED_UNI_STATES.INTERPRETING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.THINKING,
    tone: VOICE_MODE_TONES.THINKING,
    status: 'Entendendo',
    action: VOICE_MODE_ACTIONS.NONE,
  }),
  // Janela curta entre a transcrição pronta e o início da resposta: ainda é
  // "entendendo" para quem olha a tela.
  [SIMPLIFIED_UNI_STATES.SUCCESS]: Object.freeze({
    orb: UNI_RING_ORB_STATES.THINKING,
    tone: VOICE_MODE_TONES.THINKING,
    status: 'Entendendo',
    action: VOICE_MODE_ACTIONS.NONE,
  }),
  [SIMPLIFIED_UNI_STATES.EXECUTING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.THINKING,
    tone: VOICE_MODE_TONES.THINKING,
    status: 'Registrando',
    action: VOICE_MODE_ACTIONS.NONE,
  }),
  [SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION]: Object.freeze({
    orb: UNI_RING_ORB_STATES.IDLE,
    tone: VOICE_MODE_TONES.READY,
    status: 'Rascunho pronto',
    action: VOICE_MODE_ACTIONS.START,
  }),
  [SIMPLIFIED_UNI_STATES.SPEAKING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.SPEAKING,
    tone: VOICE_MODE_TONES.THINKING,
    status: 'Falando',
    action: VOICE_MODE_ACTIONS.STOP_SPEAKING,
  }),
  [SIMPLIFIED_UNI_STATES.ERROR]: Object.freeze({
    orb: UNI_RING_ORB_STATES.IDLE,
    tone: VOICE_MODE_TONES.ERROR,
    status: 'Não consegui ouvir',
    action: VOICE_MODE_ACTIONS.START,
  }),
});

export function resolveVoiceModeView(interactionState) {
  return VIEW_BY_STATE[interactionState] ?? VIEW_BY_STATE[SIMPLIFIED_UNI_STATES.IDLE];
}

// Rótulo e nome acessível do botão central para cada ação.
export const VOICE_MODE_ACTION_LABELS = Object.freeze({
  [VOICE_MODE_ACTIONS.START]: Object.freeze({ label: 'Falar', aria: 'Falar com a Uni' }),
  [VOICE_MODE_ACTIONS.STOP_LISTENING]: Object.freeze({ label: 'Enviar', aria: 'Parar de gravar e enviar' }),
  [VOICE_MODE_ACTIONS.STOP_SPEAKING]: Object.freeze({ label: 'Parar', aria: 'Parar a resposta da Uni' }),
  // Redesign (épico #91, tela 03): o botão central da conversa diz "Parar".
  [VOICE_MODE_ACTIONS.END_CONVERSATION]: Object.freeze({ label: 'Parar', aria: 'Parar a conversa com a Uni' }),
  [VOICE_MODE_ACTIONS.NONE]: Object.freeze({ label: 'Aguarde', aria: 'Aguarde a Uni terminar' }),
});

// Botão de mutar da conversa em tempo real. Só aparece com a conversa
// conectada: antes disso não há microfone aberto.
const REALTIME_MUTE_STATUSES = new Set([
  REALTIME_STATUS.LISTENING,
  REALTIME_STATUS.USER_SPEAKING,
  REALTIME_STATUS.THINKING,
  REALTIME_STATUS.SPEAKING,
]);

export function canMuteRealtimeConversation(realtimeStatus) {
  return REALTIME_MUTE_STATUSES.has(realtimeStatus);
}

export const VOICE_MODE_MUTE_LABELS = Object.freeze({
  muted: Object.freeze({ label: 'Desmutar', aria: 'Ligar o microfone' }),
  unmuted: Object.freeze({ label: 'Mutar', aria: 'Desligar o microfone' }),
});

// Conversa em tempo real: a pessoa fala e interrompe a Uni com a voz, sem
// botão de enviar. Enquanto a conversa está aberta, o botão central só
// encerra.
const REALTIME_VIEW_BY_STATUS = Object.freeze({
  [REALTIME_STATUS.IDLE]: Object.freeze({
    orb: UNI_RING_ORB_STATES.IDLE,
    tone: VOICE_MODE_TONES.NEUTRAL,
    status: 'Toque no orb para conversar',
    action: VOICE_MODE_ACTIONS.START,
  }),
  [REALTIME_STATUS.CONNECTING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.THINKING,
    tone: VOICE_MODE_TONES.THINKING,
    status: 'Conectando',
    action: VOICE_MODE_ACTIONS.END_CONVERSATION,
  }),
  [REALTIME_STATUS.LISTENING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.LISTENING,
    tone: VOICE_MODE_TONES.LISTENING,
    status: 'Ouvindo',
    action: VOICE_MODE_ACTIONS.END_CONVERSATION,
  }),
  [REALTIME_STATUS.USER_SPEAKING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.LISTENING,
    tone: VOICE_MODE_TONES.LISTENING,
    status: 'Ouvindo',
    action: VOICE_MODE_ACTIONS.END_CONVERSATION,
  }),
  [REALTIME_STATUS.THINKING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.THINKING,
    tone: VOICE_MODE_TONES.THINKING,
    status: 'Entendendo',
    action: VOICE_MODE_ACTIONS.END_CONVERSATION,
  }),
  [REALTIME_STATUS.SPEAKING]: Object.freeze({
    orb: UNI_RING_ORB_STATES.SPEAKING,
    tone: VOICE_MODE_TONES.THINKING,
    status: 'Falando',
    action: VOICE_MODE_ACTIONS.END_CONVERSATION,
  }),
  [REALTIME_STATUS.ENDED]: Object.freeze({
    orb: UNI_RING_ORB_STATES.IDLE,
    tone: VOICE_MODE_TONES.NEUTRAL,
    status: 'Conversa encerrada',
    action: VOICE_MODE_ACTIONS.START,
  }),
  [REALTIME_STATUS.ERROR]: Object.freeze({
    orb: UNI_RING_ORB_STATES.IDLE,
    tone: VOICE_MODE_TONES.ERROR,
    status: 'Não consegui conectar',
    action: VOICE_MODE_ACTIONS.START,
  }),
});

// Com um rascunho esperando confirmação, a conversa parada (Uni ouvindo sem
// ninguém falar, ou Uni falando) mostra "Rascunho pronto" em verde, como o
// estado 3 do design. Quando a pessoa fala, volta a "Ouvindo".
const REALTIME_DRAFT_READY_STATUSES = new Set([
  REALTIME_STATUS.LISTENING,
  REALTIME_STATUS.SPEAKING,
]);

// Microfone mutado: enquanto a Uni ouviria, a tela diz que ela não ouve. O
// orb e as ondas param, porque não há voz chegando. A Uni falando continua
// como está.
const REALTIME_MUTED_STATUSES = new Set([
  REALTIME_STATUS.LISTENING,
  REALTIME_STATUS.USER_SPEAKING,
]);

const REALTIME_MUTED_VIEW = Object.freeze({
  orb: UNI_RING_ORB_STATES.IDLE,
  tone: VOICE_MODE_TONES.MUTED,
  status: 'Microfone desligado',
  action: VOICE_MODE_ACTIONS.END_CONVERSATION,
});

export function resolveRealtimeVoiceModeView(realtimeStatus, { hasPendingDraft = false, isMuted = false } = {}) {
  const view = REALTIME_VIEW_BY_STATUS[realtimeStatus] ?? REALTIME_VIEW_BY_STATUS[REALTIME_STATUS.IDLE];
  if (isMuted && REALTIME_MUTED_STATUSES.has(realtimeStatus)) return REALTIME_MUTED_VIEW;
  if (!hasPendingDraft || !REALTIME_DRAFT_READY_STATUSES.has(realtimeStatus)) return view;
  return Object.freeze({ ...view, tone: VOICE_MODE_TONES.READY, status: 'Rascunho pronto' });
}

// O que ocupa o miolo da tela de voz. As ondas aparecem enquanto a pessoa
// fala, ou enquanto a Uni ouve e ainda não respondeu nada. Fora disso fica a
// resposta (texto e card). O orb encolhe de 180 para 120 quando há resposta
// ou rascunho na tela, para o card caber sem rolar.
export function resolveVoiceModeStage({ view, isUserSpeaking = false, hasReply = false } = {}) {
  const isListening = view?.tone === VOICE_MODE_TONES.LISTENING;
  const showWaves = isListening && (isUserSpeaking || !hasReply);
  const isThinking = view?.orb === UNI_RING_ORB_STATES.THINKING;
  const compact = !showWaves && !isThinking && (view?.tone === VOICE_MODE_TONES.READY || hasReply);
  return Object.freeze({ showWaves, compact });
}

// Cada conversa por voz começa vazia: o card da tela de voz não mostra a
// troca da conversa anterior. A exceção é o rascunho esperando confirmação,
// que a Uni cita na saudação e precisa continuar na tela, junto com o pedido
// que o gerou.
export function snapshotVoiceConversationStart(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const pendingIndex = list.findLastIndex((message) => message?.confirmation?.status === 'pending');
  const keptIds = new Set();
  if (pendingIndex >= 0) {
    keptIds.add(list[pendingIndex].id);
    const request = list[pendingIndex - 1];
    if (request?.from === 'user') keptIds.add(request.id);
  }
  return new Set(list.map((message) => message?.id).filter((id) => id != null && !keptIds.has(id)));
}

export function selectVoiceConversationMessages(messages, previousIds) {
  const list = Array.isArray(messages) ? messages : [];
  if (!previousIds?.size) return list;
  return list.filter((message) => !previousIds.has(message?.id));
}
