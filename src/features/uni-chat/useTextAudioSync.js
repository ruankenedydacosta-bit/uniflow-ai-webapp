import { useEffect, useState } from 'react';
import { VOICE_TTS_STATUS } from '../uni-voice-tts/index.js';
import { reduceTextAudioSyncState, TEXT_AUDIO_SYNC_PHASES } from './textAudioSync.js';

// Limite de segurança: se a mensagem ativa ficar em 'pending' (áudio ainda
// não começou de verdade) por mais que isso, força o texto completo em vez
// de deixar a resposta escondida indefinidamente -- cobre exatamente o caso
// pedido (autoplay bloqueado pela política do navegador/iOS: não pode
// travar a UI, o texto aparece completo mesmo sem voz).
const PENDING_SAFETY_TIMEOUT_MS = 3000;

/**
 * FASE ESTADOS DE PROCESSAMENTO: sincronização texto<->voz. Hook ÚNICO e
 * compartilhado (Home + chat completo) -- toda a lógica de transição vive em
 * textAudioSync.js (puro); este hook só liga essa lógica aos eventos REAIS
 * do player (via `ttsStatus`, que já reflete audio.onplay/onended/onerror --
 * ver useUniVoiceTts.js).
 *
 * HOTFIX (abandono da revelação progressiva): não existe mais laço de
 * animação nenhum. O texto fica oculto ('pending') até o áudio realmente
 * começar a tocar; nesse instante ele aparece COMPLETO, junto com a voz.
 *
 * `activeMessage` deve ser `{ id, text } | null` -- a mensagem atualmente
 * visada pelo player (ex.: `voiceMessageId === message.id` em
 * UniChatPage.jsx). Enquanto `activeMessage` é null ou não corresponde à
 * mensagem sendo renderizada, o chamador deve simplesmente usar
 * `message.text` (texto completo, comportamento inalterado) -- este hook só
 * entra em ação para a mensagem realmente ativa.
 *
 * Contrato de retorno:
 * - `activeMessageId`: espelha `activeMessage?.id ?? null`.
 * - `phase`: 'idle' | 'pending' | 'done' -- ver TEXT_AUDIO_SYNC_PHASES. Em
 *   'pending', `displayText` é SEMPRE '' (nunca mostra texto antigo nem o
 *   novo antes da hora).
 * - `displayText`: '' em pending/idle; o texto completo em 'done'.
 *
 * Repetir a reprodução da MESMA mensagem (mesmo id) nunca volta a esconder o
 * texto -- ver reduceTextAudioSyncState (fase 'done' é preservada).
 */
export function useTextAudioSync({ activeMessage, ttsStatus }) {
  const activeId = activeMessage?.id ?? null;
  const activeText = activeMessage?.text ?? '';

  const [state, setState] = useState(() => ({
    id: activeId,
    phase: activeId ? TEXT_AUDIO_SYNC_PHASES.PENDING : TEXT_AUDIO_SYNC_PHASES.IDLE,
  }));

  // Transição de FASE ajustada durante a renderização -- só quando id/status
  // realmente mudam (chave estável), nunca em resposta à mesma combinação
  // repetida. Mesmo padrão de reset-por-key já usado no projeto. Isso também
  // é o que garante identidade: uma mensagem nova SEMPRE substitui qualquer
  // fase anterior no mesmo render em que activeId muda -- nunca há uma
  // mensagem antiga "sobrevivendo" visualmente.
  const transitionKey = `${activeId ?? 'none'}:${ttsStatus}`;
  const [prevTransitionKey, setPrevTransitionKey] = useState(transitionKey);
  if (transitionKey !== prevTransitionKey) {
    setPrevTransitionKey(transitionKey);
    setState((prev) => reduceTextAudioSyncState(prev, {
      activeId,
      ttsStatus,
      playingStatus: VOICE_TTS_STATUS.PLAYING,
      stoppedStatus: VOICE_TTS_STATUS.STOPPED,
      errorStatus: VOICE_TTS_STATUS.ERROR,
    }));
  }

  // Rede de segurança -- 'pending' nunca fica preso indefinidamente (voz
  // desabilitada, TTS indisponível, ou autoplay bloqueado). Cancelada assim
  // que a fase muda (inclusive quando a reprodução real começa antes do
  // limite).
  useEffect(() => {
    if (state.phase !== TEXT_AUDIO_SYNC_PHASES.PENDING || state.id !== activeId) {
      return undefined;
    }
    const pendingId = activeId;
    const timeoutId = window.setTimeout(() => {
      setState((prev) => {
        if (prev.id !== pendingId || prev.phase !== TEXT_AUDIO_SYNC_PHASES.PENDING) return prev;
        return { id: pendingId, phase: TEXT_AUDIO_SYNC_PHASES.DONE };
      });
    }, PENDING_SAFETY_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [state.phase, state.id, activeId]);

  const isDone = state.id === activeId && state.phase === TEXT_AUDIO_SYNC_PHASES.DONE;
  const displayText = isDone ? activeText : '';

  return {
    activeMessageId: activeId,
    phase: state.id === activeId ? state.phase : TEXT_AUDIO_SYNC_PHASES.IDLE,
    displayText,
  };
}
