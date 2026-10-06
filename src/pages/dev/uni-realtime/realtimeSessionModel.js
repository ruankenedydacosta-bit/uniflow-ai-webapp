// Estado e métricas do protótipo de conversa contínua (OpenAI Realtime).
// Puro: recebe os eventos do canal "oai-events" com a hora em que chegaram
// e devolve o próximo estado. O hook só liga o WebRTC a este reducer.

export const REALTIME_STATUS = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  USER_SPEAKING: 'user_speaking',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ENDED: 'ended',
  ERROR: 'error',
});

// Preço em US$ por 1M de tokens do gpt-realtime-2.1-mini (página do modelo,
// consultada em 06/10/2026). O desconto de cache fica de fora: a estimativa
// sai um pouco acima do real.
export const REALTIME_MINI_PRICES_USD = Object.freeze({
  audioIn: 10,
  textIn: 0.6,
  audioOut: 20,
  textOut: 2.4,
});

// Mesmo câmbio do artefato de custos da voz.
export const USD_TO_BRL = 5.5;

const EMPTY_USAGE = Object.freeze({
  audioIn: 0,
  textIn: 0,
  cachedIn: 0,
  audioOut: 0,
  textOut: 0,
});

export function createRealtimeSessionState() {
  return {
    status: REALTIME_STATUS.IDLE,
    startedAt: null,
    endedAt: null,
    endReason: null,
    lastActivityAt: null,
    speechStoppedAt: null,
    uniSpeaking: false,
    latenciesMs: [],
    interruptions: 0,
    falseInterruptions: 0,
    transcript: [],
    usage: { ...EMPTY_USAGE },
    error: null,
  };
}

function toCount(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function addUsage(usage, responseUsage) {
  const input = responseUsage?.input_token_details ?? {};
  const output = responseUsage?.output_token_details ?? {};
  return {
    audioIn: usage.audioIn + toCount(input.audio_tokens),
    textIn: usage.textIn + toCount(input.text_tokens),
    cachedIn: usage.cachedIn + toCount(input.cached_tokens),
    audioOut: usage.audioOut + toCount(output.audio_tokens),
    textOut: usage.textOut + toCount(output.text_tokens),
  };
}

function appendTranscript(state, role, itemId, text) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) return state;
  return {
    ...state,
    transcript: [...state.transcript, { role, itemId: itemId ?? null, text: clean }],
  };
}

// Ações locais (início, fim, marcação) e eventos do servidor passam pelo
// mesmo reducer, para a ordem ficar sempre a da chegada.
export function reduceRealtimeEvent(state, event, at) {
  if (!event || typeof event.type !== 'string') return state;

  switch (event.type) {
    case 'local.connecting':
      return { ...createRealtimeSessionState(), status: REALTIME_STATUS.CONNECTING };
    case 'local.connected':
      return { ...state, status: REALTIME_STATUS.LISTENING, startedAt: at, lastActivityAt: at };
    case 'local.ended':
      if (state.status === REALTIME_STATUS.ENDED || state.status === REALTIME_STATUS.ERROR) return state;
      return {
        ...state,
        status: REALTIME_STATUS.ENDED,
        endedAt: at,
        endReason: event.reason ?? 'user',
        uniSpeaking: false,
      };
    case 'local.failed':
      return {
        ...state,
        status: REALTIME_STATUS.ERROR,
        endedAt: state.startedAt ? at : null,
        uniSpeaking: false,
        error: event.message ?? 'A conversa caiu.',
      };
    case 'local.mark_false_interruption':
      if (state.falseInterruptions >= state.interruptions) return state;
      return { ...state, falseInterruptions: state.falseInterruptions + 1 };

    case 'input_audio_buffer.speech_started':
      return {
        ...state,
        status: REALTIME_STATUS.USER_SPEAKING,
        lastActivityAt: at,
        speechStoppedAt: null,
        interruptions: state.uniSpeaking ? state.interruptions + 1 : state.interruptions,
      };
    case 'input_audio_buffer.speech_stopped':
      return { ...state, status: REALTIME_STATUS.THINKING, lastActivityAt: at, speechStoppedAt: at };
    case 'output_audio_buffer.started':
      return {
        ...state,
        status: REALTIME_STATUS.SPEAKING,
        uniSpeaking: true,
        lastActivityAt: at,
        speechStoppedAt: null,
        latenciesMs: state.speechStoppedAt === null
          ? state.latenciesMs
          : [...state.latenciesMs, at - state.speechStoppedAt],
      };
    case 'output_audio_buffer.stopped':
    case 'output_audio_buffer.cleared':
      return {
        ...state,
        // Se a pessoa já começou a falar (interrupção), continua ouvindo.
        status: state.status === REALTIME_STATUS.SPEAKING ? REALTIME_STATUS.LISTENING : state.status,
        uniSpeaking: false,
        lastActivityAt: at,
      };
    case 'conversation.item.input_audio_transcription.completed':
      return appendTranscript(state, 'user', event.item_id, event.transcript);
    case 'response.output_audio_transcript.done':
      return appendTranscript(state, 'uni', event.item_id, event.transcript);
    case 'response.done':
      return { ...state, usage: addUsage(state.usage, event.response?.usage) };
    case 'error':
      // Erro de evento não derruba a sessão: fica visível para diagnóstico.
      return { ...state, error: event.error?.message ?? 'O servidor devolveu um erro.' };
    default:
      return state;
  }
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function estimateCostUsd(usage, prices = REALTIME_MINI_PRICES_USD) {
  return (
    usage.audioIn * prices.audioIn
    + usage.textIn * prices.textIn
    + usage.audioOut * prices.audioOut
    + usage.textOut * prices.textOut
  ) / 1_000_000;
}

export function summarizeRealtimeSession(state, now) {
  const end = state.endedAt ?? now;
  const sessionMs = state.startedAt === null ? 0 : Math.max(0, end - state.startedAt);
  const costUsd = estimateCostUsd(state.usage);
  const minutes = sessionMs / 60000;
  return {
    sessionMs,
    turns: state.latenciesMs.length,
    latencyP50Ms: percentile(state.latenciesMs, 50),
    latencyP95Ms: percentile(state.latenciesMs, 95),
    interruptions: state.interruptions,
    falseInterruptions: state.falseInterruptions,
    costUsd,
    costBrl: costUsd * USD_TO_BRL,
    costBrlPerMinute: minutes > 0 ? (costUsd * USD_TO_BRL) / minutes : null,
  };
}

// Sessão aberta sem ninguém falando custa sem servir a ninguém.
export function isRealtimeSessionIdle(state, now, idleLimitMs) {
  if (state.lastActivityAt === null || state.uniSpeaking) return false;
  const active = state.status === REALTIME_STATUS.LISTENING || state.status === REALTIME_STATUS.THINKING;
  return active && now - state.lastActivityAt >= idleLimitMs;
}
