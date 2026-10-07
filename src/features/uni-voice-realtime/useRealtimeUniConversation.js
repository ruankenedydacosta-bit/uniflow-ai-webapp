import { useCallback, useEffect, useRef } from 'react';
import { REALTIME_STATUS } from './realtimeSessionModel.js';
import {
  buildNamePronunciationSavedOutput,
  buildScreenActionInstructions,
  buildRealtimeToolErrorOutput,
  readRealtimeNamePronunciation,
  readRealtimeToolPhrase,
  REALTIME_TOOL_NAMES,
  REALTIME_TOOL_TIMEOUT_MS,
  resolveRealtimeToolOutcome,
  resolveScreenActionOutcome,
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
// onSaveNamePronunciation(pronuncia) grava no perfil como se fala o nome da
// pessoa; a sessão seguinte já abre com ela.
//
// announceScreenAction(acao) vem antes de o chat tratar um toque no card
// (REALTIME_SCREEN_ACTIONS): quando a resposta do chat chega, a Uni a fala.
//
// onActiveChange avisa o chat para não falar as respostas com a voz antiga
// enquanto a conversa está aberta: quem fala é a Uni da conversa.
export function useRealtimeUniConversation({
  messages,
  isBusy,
  onSendTranscript,
  onActiveChange,
  onSaveNamePronunciation,
}) {
  const messagesRef = useRef(messages);
  const isBusyRef = useRef(isBusy);
  const sendRef = useRef(onSendTranscript);
  const saveNamePronunciationRef = useRef(onSaveNamePronunciation);
  const pendingTurnRef = useRef(null);
  const screenActionRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
    isBusyRef.current = isBusy;
    sendRef.current = onSendTranscript;
    saveNamePronunciationRef.current = onSaveNamePronunciation;
  });

  const saveNamePronunciation = useCallback(async (args) => {
    const pronunciation = readRealtimeNamePronunciation(args);
    if (!pronunciation) {
      return buildRealtimeToolErrorOutput('Não entendi a pronúncia. Peça para a pessoa falar o nome de novo.');
    }
    const result = await saveNamePronunciationRef.current?.(pronunciation);
    if (!result || result.error) {
      return buildRealtimeToolErrorOutput('Não consegui guardar a pronúncia. Use do jeito novo nesta conversa e diga que na próxima pode ser preciso corrigir de novo.');
    }
    return buildNamePronunciationSavedOutput();
  }, []);

  const handleToolCall = useCallback(({ name, args }) => {
    if (name === REALTIME_TOOL_NAMES.SAVE_NAME_PRONUNCIATION) return saveNamePronunciation(args);
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

    // Um toque no card que o chat ignorou não pode narrar a resposta deste
    // turno.
    screenActionRef.current = null;
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
  }, [saveNamePronunciation]);

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
  const isActiveRef = useRef(isActive);
  const narrateScreenEvent = session.narrateScreenEvent;

  useEffect(() => {
    isActiveRef.current = isActive;
    if (!isActive) screenActionRef.current = null;
  }, [isActive]);

  // Com um turno da ferramenta aberto, a saída dele já conta o que houve.
  const announceScreenAction = useCallback((action) => {
    if (!isActiveRef.current || pendingTurnRef.current) return;
    screenActionRef.current = { action, turn: snapshotRealtimeToolTurn(messagesRef.current) };
  }, []);

  useEffect(() => {
    const screenAction = screenActionRef.current;
    if (!screenAction || isBusy) return;
    const outcome = resolveScreenActionOutcome(messages, screenAction.turn);
    if (!outcome) return;
    screenActionRef.current = null;
    narrateScreenEvent(buildScreenActionInstructions(screenAction.action, outcome));
  }, [messages, isBusy, narrateScreenEvent]);

  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  });
  useEffect(() => {
    onActiveChangeRef.current?.(isActive);
  }, [isActive]);

  return { ...session, isActive, announceScreenAction };
}
