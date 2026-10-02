import { UNI_RING_ORB_STATES } from '../../components/ui/UniRingOrb/uniRingOrbModel.js';
import { SIMPLIFIED_UNI_STATES } from './simplifiedHomeState.js';

// Tom do status no topo da tela de voz: azul ouvindo, roxo entendendo ou
// falando, verde quando há rascunho para conferir.
export const VOICE_MODE_TONES = Object.freeze({
  NEUTRAL: 'neutral',
  LISTENING: 'listening',
  THINKING: 'thinking',
  READY: 'ready',
  ERROR: 'error',
});

// Ação do botão central (e do toque no orb). Uma ação por estado: nunca
// "parar" e "falar" no mesmo toque.
export const VOICE_MODE_ACTIONS = Object.freeze({
  START: 'start',
  STOP_LISTENING: 'stop_listening',
  STOP_SPEAKING: 'stop_speaking',
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
  [VOICE_MODE_ACTIONS.NONE]: Object.freeze({ label: 'Aguarde', aria: 'Aguarde a Uni terminar' }),
});
