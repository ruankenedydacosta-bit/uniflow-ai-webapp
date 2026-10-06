import { REALTIME_STATUS } from './realtimeSessionModel.js';

// Som de fim de conversa: duas notas descendo, curtas e baixas, no estilo do
// "desligou" das chamadas de vídeo. Sintetizado no Web Audio, sem arquivo.
const END_NOTES_HZ = Object.freeze([659.25, 440]);
const NOTE_SECONDS = 0.16;
const NOTE_GAP_SECONDS = 0.04;
const PEAK_GAIN = 0.12;

// Toca quando uma conversa que chegou a conectar termina, pela pessoa, por
// inatividade, por fim dos minutos ou por queda. Não toca quando o app vai
// para segundo plano: ali ninguém está olhando a tela.
export function shouldPlayConversationEndSound(previous, next) {
  if (!previous || !next || previous.startedAt === null || previous.startedAt === undefined) return false;
  const wasOpen = previous.status !== REALTIME_STATUS.ENDED && previous.status !== REALTIME_STATUS.ERROR;
  if (!wasOpen) return false;
  if (next.status === REALTIME_STATUS.ERROR) return true;
  return next.status === REALTIME_STATUS.ENDED && next.endReason !== 'lifecycle';
}

// O iOS só libera áudio criado num toque da pessoa: prime() vai no toque que
// abre a conversa, e play() reaproveita o mesmo contexto no fim, que pode vir
// sem toque (inatividade, minutos, queda).
export function createConversationEndSound(runtime = globalThis) {
  let context = null;

  function prime() {
    const AudioContextClass = runtime?.AudioContext ?? runtime?.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      context ??= new AudioContextClass();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {
      context = null;
    }
  }

  function play() {
    if (!context) return;
    try {
      const startAt = context.currentTime + 0.02;
      END_NOTES_HZ.forEach((frequency, index) => {
        const noteStart = startAt + index * (NOTE_SECONDS + NOTE_GAP_SECONDS);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(PEAK_GAIN, noteStart + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + NOTE_SECONDS);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + NOTE_SECONDS + 0.02);
      });
    } catch {
      // Sem som o fim continua visível na tela.
    }
  }

  function dispose() {
    context?.close().catch(() => {});
    context = null;
  }

  return { prime, play, dispose };
}
