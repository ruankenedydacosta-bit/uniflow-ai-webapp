import { useCallback, useEffect, useRef } from 'react';
import { REALTIME_STATUS } from './realtimeSessionModel.js';
import {
  buildRealtimeToolErrorOutput,
  readRealtimeToolPhrase,
  REALTIME_TOOL_NAMES,
  REALTIME_TOOL_TIMEOUT_MS,
  resolveRealtimeToolOutcome,
  snapshotRealtimeToolTurn,
} from './realtimeToolBridge.js';
import { useRealtimeVoiceSession } from './useRealtimeVoiceSession.js';

const ACTIVE_STATUSES = new Set([
  REALTIME_STATUS.CONNECTING,
  REALTIME_STATUS.LISTENING,
  REALTIME_STATUS.USER_SPEAKING,
  REALTIME_STATUS.THINKING,
  REALTIME_STATUS.SPEAKING,
]);

export function isRealtimeConversationActive(status) {
  return ACTIVE_STATUSES.has(status);
}

// Conversa por voz em tempo real ligada ao chat da Uni. Quando a Uni chama a
// ferramenta, a frase vai para onSendTranscript (o mesmo caminho do texto) e
// a ferramenta só devolve quando o chat termina o turno.
//
// onActiveChange avisa o chat para não falar as respostas com a voz antiga
// enquanto a conversa está aberta: quem fala é a Uni da conversa.
export function useRealtimeUniConversation({
  messages,
  isBusy,
  onSendTranscript,
  onActiveChange,
}) {
  const messagesRef = useRef(messages);
  const isBusyRef = useRef(isBusy);
  const sendRef = useRef(onSendTranscript);
  const pendingTurnRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
    isBusyRef.current = isBusy;
    sendRef.current = onSendTranscript;
  });

  const handleToolCall = useCallback(({ name, args }) => {
    if (name !== REALTIME_TOOL_NAMES.SEND_TO_UNI) {
      return Promise.resolve(buildRealtimeToolErrorOutput('Ferramenta desconhecida.'));
    }
    const phrase = readRealtimeToolPhrase(args);
    if (!phrase) {
      return Promise.resolve(buildRealtimeToolErrorOutput('Não entendi o pedido. Peça para a pessoa repetir.'));
    }
    if (isBusyRef.current || pendingTurnRef.current) {
      return Promise.resolve(buildRealtimeToolErrorOutput('A Uni ainda está terminando o pedido anterior. Peça para a pessoa aguardar um instante.'));
    }

    return new Promise((resolve) => {
      const turn = snapshotRealtimeToolTurn(messagesRef.current);
      const timer = setTimeout(() => {
        finish(buildRealtimeToolErrorOutput('A Uni demorou para responder. Peça para a pessoa tentar de novo ou conferir na tela.'));
      }, REALTIME_TOOL_TIMEOUT_MS);
      function finish(output) {
        clearTimeout(timer);
        if (pendingTurnRef.current?.finish === finish) pendingTurnRef.current = null;
        resolve(output);
      }
      pendingTurnRef.current = { turn, finish };
      sendRef.current?.(phrase, { source: 'voice' });
    });
  }, []);

  useEffect(() => {
    const pending = pendingTurnRef.current;
    if (!pending || isBusy) return;
    const output = resolveRealtimeToolOutcome(messages, pending.turn);
    if (output) pending.finish(output);
  }, [messages, isBusy]);

  useEffect(() => () => {
    pendingTurnRef.current?.finish(buildRealtimeToolErrorOutput('A conversa foi encerrada.'));
  }, []);

  const session = useRealtimeVoiceSession({ onToolCall: handleToolCall });
  const isActive = isRealtimeConversationActive(session.state.status);

  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  });
  useEffect(() => {
    onActiveChangeRef.current?.(isActive);
  }, [isActive]);

  return { ...session, isActive };
}
