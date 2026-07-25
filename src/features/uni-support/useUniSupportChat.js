// SUPORTE1: estado do chat da Central de Suporte -- muito mais simples que
// UniChatPage.jsx (chat financeiro): sem classificadores determinísticos de
// intenção financeira, sem ações confirmáveis, sem alternância de
// mode PF/PJ da conversa (o histórico de suporte não é separado por
// espaço). Reaproveita a MESMA infraestrutura de transporte (useUniLlm,
// mesmo provider/cancel) e a MESMA tabela de conversas/mensagens, apenas
// com conversation_type='support' (uniChatDataService.js).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUniLlm, AI_STATUS } from '../uni-llm';
import * as dataService from '../uni-chat/uniChatDataService';
import { buildUserMessage, buildUniMessage } from '../uni-chat/uniChatAdapter';

export const SUPPORT_FALLBACK_TEXT =
  'Não encontrei uma resposta confirmada para isso na base de conhecimento atual. ' +
  'Você pode reformular a pergunta ou solicitar atendimento humano abaixo.';

export function useUniSupportChat({ workspaceId, workspaceType } = {}) {
  const uniLlm = useUniLlm();
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [aiStatus, setAiStatus] = useState(AI_STATUS.UNAVAILABLE);
  const [lastKnowledge, setLastKnowledge] = useState(null);
  const lastUnresolvedRef = useRef(null);
  const aiCancelledRef = useRef(false);
  const conversationIdRef = useRef(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current;
    if (!dataService.isOnline() || !workspaceId) return null;
    const conv = await dataService.createSupportConversation(workspaceId, workspaceType);
    if (!conv) return null;
    setConversationId(conv.id);
    conversationIdRef.current = conv.id;
    return conv.id;
  }, [workspaceId, workspaceType]);

  const persistMessage = useCallback(async (msg) => {
    const convId = await ensureConversation();
    if (!convId) return;
    await dataService.saveMessage(convId, msg);
  }, [ensureConversation]);

  function pushMessage(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  async function handleUnresolved(text, history) {
    lastUnresolvedRef.current = { text, history };
    setIsTyping(true);
    setAiStatus(AI_STATUS.LOADING);

    let outcome;
    try {
      outcome = await uniLlm.generateSupportResponse({ text, messages: history, workspace: workspaceType });
    } catch {
      outcome = null;
    } finally {
      setIsTyping(false);
    }

    const llmText = outcome?.text ?? null;
    setLastKnowledge(outcome?.knowledge ?? null);

    if (llmText) {
      setAiStatus(AI_STATUS.SUCCESS);
    } else if (aiCancelledRef.current) {
      setAiStatus(AI_STATUS.CANCELLED);
    } else {
      setAiStatus(AI_STATUS.ERROR);
    }
    aiCancelledRef.current = false;

    const assistantMsg = buildUniMessage(llmText || SUPPORT_FALLBACK_TEXT);
    pushMessage(assistantMsg);
    void persistMessage(assistantMsg);
  }

  const sendText = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    const historySnapshot = messages;

    const userMsg = buildUserMessage(trimmed);
    pushMessage(userMsg);
    void persistMessage(userMsg);

    void handleUnresolved(trimmed, historySnapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping, messages, persistMessage]);

  const cancel = useCallback(() => {
    if (aiStatus !== AI_STATUS.LOADING) return;
    aiCancelledRef.current = true;
    uniLlm.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiStatus]);

  const retry = useCallback(() => {
    const pending = lastUnresolvedRef.current;
    if (!pending || isTyping) return;
    setAiStatus(AI_STATUS.UNAVAILABLE);
    void handleUnresolved(pending.text, pending.history);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping]);

  const reset = useCallback(() => {
    uniLlm.cancel();
    setMessages([]);
    setConversationId(null);
    conversationIdRef.current = null;
    setIsTyping(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    setLastKnowledge(null);
    lastUnresolvedRef.current = null;
    aiCancelledRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    messages,
    isTyping,
    aiStatus,
    lastKnowledge,
    sendText,
    cancel,
    retry,
    reset,
    enabled: uniLlm.enabled,
  };
}
