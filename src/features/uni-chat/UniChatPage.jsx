import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildUniPrefillFromState } from '../categories/categoryUtils.js';
import { useAccess } from '../../app/AccessContext';
import { useSession } from '../../app/SessionContext';
import {
  buildAccountCreationConfirmation,
  cancelAccountCreationDependency,
  classifyPendingActionReply,
  clearPendingActionStack,
  clearPendingAction,
  completeAccountCreationDependency,
  createPendingActionCoordinator,
  findAccountCreationConflicts,
  getActivePendingAction,
  isAccountCreationDependency,
  isCancelEntirePendingFlow,
  loadPendingActionStack,
  loadPendingAction,
  resolvePendingActionInput,
  savePendingActionStack,
  savePendingAction,
  startAccountCreationDependency,
  updateResumedFinancialSnapshot,
  useUniConversation,
} from '../uni-conversation';
import { useUniLlm, AI_STATUS } from '../uni-llm';
import { useUniVoiceTts, useVoicePreference, VOICE_TTS_STATUS } from '../uni-voice-tts';
import { useAccounts, useCategories, useTransactions, useFinancialBalances } from '../../hooks';
import { useGoals } from '../goals/useGoals';
import { buildFutureProjections } from '../future/futureService';
import { useUniChatFinancialData } from './useUniChatFinancialData';
import {
  classifyFinancialQuery,
  buildQueryResponse,
  detectFutureFinancialIntent,
  buildFutureSafetyResponse,
} from './financialQueryInterpreter';
import ChatHeader from './components/ChatHeader';
import EmptyState from './components/EmptyState';
import MessageBubble from './components/MessageBubble';
import TypingIndicator from './components/TypingIndicator';
import QuickSuggestions from './components/QuickSuggestions';
import ChatInput from './components/ChatInput';

import ScrollToLatest from './components/ScrollToLatest';
import HistoryPanel from './components/HistoryPanel';
import ErrorState from './components/ErrorState';
import {
  SUGGESTIONS_PESSOAL,
  SUGGESTIONS_EMPRESA,
} from './mockData';
import { resolveGreetingName } from './greeting';
import {
  loadHistory,
  saveHistory,
  loadActiveId,
  saveActiveId,
  createConversation as createLocalConversation,
  persistConversation,
  saveActiveSource,
} from './chatHistory';
import {
  buildUserMessage,
  buildUniMessage,
  buildConfirmationFromAction,
  workspaceTypeToMode,
  modeToWorkspaceType,
} from './uniChatAdapter';
import { financialCrudMock, fallbackAccountTypes } from '../../pages/financeiro/financialCrud.mock';
import { notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import { executeConfirmedFinancialAction } from '../../services/confirmedFinancialActionService.js';
import * as dataService from './uniChatDataService';
import styles from './UniChatPage.module.css';

const UNI_THINK_MIN_MS = 600;
const ALLOWED_CHAT_WRITE_INTENTS = Object.freeze(['register_income', 'register_expense']);

const UNI_DETERMINISTIC_FALLBACK_TEXT =
  'Entendi. Por enquanto, posso ajudar a registrar movimenta\u00e7\u00f5es financeiras. Tente algo como "registrar uma despesa de R$ 50" ou "qual meu saldo?".';

function getLocalIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function UniChatPage() {
  const { access } = useAccess();
  const { profile, user, workspace, switchWorkspace, availableWorkspaces } = useSession();
  const location = useLocation();
  const initialContextRef = useRef(false);

  const personalityProfileId = profile?.uni_personality_profile ?? 'balanced';

  // ELEVEN2: fundacao geral de TTS (ELEVEN1) conectada ao chat -- substitui
  // o uso anterior de useUniVoiceOutput (infra de demo com allowlist) NESTE
  // ponto de integracao. uni-voice-output continua existindo/testado, so
  // deixou de ser consumido pelo chat principal (evita dois players/estados
  // de voz ativos ao mesmo tempo).
  const uniVoice = useUniVoiceTts();
  const voicePreference = useVoicePreference();
  const uniLlm = useUniLlm();
  // Qual mensagem o estado COMPARTILHADO de uniVoice.status representa
  // agora -- so essa mensagem mostra Gerando/Reproduzindo/Pausado/Erro;
  // as demais sempre veem IDLE (botao "Ouvir" neutro).
  const [voiceMessageId, setVoiceMessageId] = useState(null);

  const handleSpeakMessage = useCallback((message) => {
    if (!message?.text) return;
    setVoiceMessageId(message.id);
    void uniVoice.speak(message.text);
  }, [uniVoice]);

  const handlePauseResumeVoice = useCallback(() => {
    if (uniVoice.status === VOICE_TTS_STATUS.PLAYING) {
      uniVoice.pause();
    } else if (uniVoice.status === VOICE_TTS_STATUS.PAUSED) {
      uniVoice.resume();
    }
  }, [uniVoice]);

  const handleStopVoice = useCallback(() => {
    uniVoice.stop();
  }, [uniVoice]);

  const financialFallback = access.currentWorkspace === 'personal'
    ? financialCrudMock.personal
    : financialCrudMock.business;

  const accountState = useAccounts({
    workspaceId: workspace?.id,
    fallbackAccounts: financialFallback.accounts,
    fallbackAccountTypes,
  });

  const categoryState = useCategories({
    workspaceId: workspace?.id,
    fallbackCategories: financialFallback.categories,
    context: access.currentWorkspace,
  });

  const transactionsState = useTransactions({
    workspaceId: workspace?.id,
    fallbackTransactions: financialFallback.transactions,
  });

  const balanceState = useFinancialBalances({ workspaceId: workspace?.id });

  const goalsState = useGoals({ workspaceId: workspace?.id });

  const futureProjections = useMemo(
    () => buildFutureProjections({
      workspaceBalance: balanceState.workspaceBalance,
      transactions: transactionsState.transactions,
      goals: goalsState.goals,
      selectedHorizon: 6,
    }),
    [balanceState.workspaceBalance, transactionsState.transactions, goalsState.goals],
  );

  const financialContext = useUniChatFinancialData({
    accounts: accountState.accounts,
    transactions: transactionsState.transactions,
    categories: categoryState.categories,
    workspaceBalance: balanceState.workspaceBalance,
  });

  const financialConversation = useUniConversation({
    accounts: accountState.accounts,
    accountTypes: accountState.accountTypes,
    categories: categoryState.categories,
    executeAtomicAction: executeConfirmedFinancialAction,
    saveAccount: accountState.saveAccount,
    saveTransaction: transactionsState.saveTransaction,
    profileId: personalityProfileId,
    workspaceType: access.currentWorkspace,
    referenceDate: getLocalIsoDate(),
    allowedWriteIntents: ALLOWED_CHAT_WRITE_INTENTS,
  });
  const saveAccountForDependency = accountState.saveAccount;
  const accountDependencyCoordinator = useMemo(
    () => createPendingActionCoordinator({
      create_financial_account: async ({ fields }) => saveAccountForDependency(fields.account),
    }),
    [saveAccountForDependency],
  );

  const [connectionStatus, setConnectionStatus] = useState(dataService.getConnectionStatus);
  const initialLoadDone = useRef(false);
  const promotionInProgressRef = useRef(false);
  const loadRequestIdRef = useRef(0);

  const [mode, setMode] = useState(() => {
    const stored = loadHistory();
    const storedId = loadActiveId();
    const wsMode = workspaceTypeToMode(access.currentWorkspace);
    if (storedId) {
      const active = stored.find((c) => c.id === storedId);
      if (active?.mode) return active.mode;
    }
    return wsMode;
  });
  const [messages, setMessages] = useState(() => {
    const storedId = loadActiveId();
    const stored = loadHistory();
    const active = stored.find((c) => c.id === storedId);
    return active?.messages || [];
  });
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [conversations, setConversations] = useState(() => {
    const stored = loadHistory();
    const storedId = loadActiveId();
    if (storedId && stored.some((c) => c.id === storedId)) return stored;
    const initMode = workspaceTypeToMode(access.currentWorkspace);
    const conv = createLocalConversation(initMode);
    const updated = [...stored, conv];
    saveHistory(updated);
    saveActiveId(conv.id);
    return updated;
  });
  const [activeId, setActiveId] = useState(() => {
    const storedId = loadActiveId();
    const stored = loadHistory();
    if (storedId && stored.some((c) => c.id === storedId)) return storedId;
    const initMode = workspaceTypeToMode(access.currentWorkspace);
    const conv = createLocalConversation(initMode);
    const updated = [...stored, conv];
    saveHistory(updated);
    saveActiveId(conv.id);
    return conv.id;
  });
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingActionStack, setPendingActionStack] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const confirmingRef = useRef(false);
  const pendingActionRef = useRef(null);
  const pendingActionStackRef = useRef(null);
  const activeIdRef = useRef(activeId);
  const convDbIdsRef = useRef({});
  const restoredPendingIdentityRef = useRef(null);

  // Integracao com a IA: estado da chamada real ao LLM, separado de `isTyping` (que
  // tambem cobre o atraso simulado do caminho deterministico). Usa o
  // vocabulario AI_STATUS ja consolidado na infraestrutura de IA -- SUCCESS/ERROR aqui nunca decidem o
  // que e exibido no chat (isso continua sendo sempre a mensagem final via
  // buildUniMessage), servem apenas para o botao cancelar e o aviso de erro
  // com nova tentativa.
  const [aiStatus, setAiStatus] = useState(AI_STATUS.UNAVAILABLE);
  // Guarda a ultima pergunta que foi (ou deveria ter sido) respondida pelo
  // LLM, para "tentar novamente" sem o usuario redigitar.
  const lastUnresolvedRef = useRef(null);
  // Marcado pelo proprio botao cancelar ANTES de chamar uniLlm.cancel() --
  // e a unica forma de diferenciar "cancelado pelo usuario" de "falhou"
  // depois que a chamada resolve (o orquestrador nunca lanca e nunca expoe
  // o codigo do erro ao chamador).
  const aiCancelledRef = useRef(false);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottom = useRef(true);
  const prevWorkspaceRef = useRef(access.currentWorkspace);

  const suggestions = mode === 'pessoal' ? SUGGESTIONS_PESSOAL : SUGGESTIONS_EMPRESA;

  // Contexto vindo da tela de Categorias: pré-preenche o campo (sem enviar),
  // preservando o fluxo de confirmação. Executado uma única vez ao montar.
  useEffect(() => {
    if (initialContextRef.current) return;
    initialContextRef.current = true;
    const prefill = buildUniPrefillFromState(location.state);
    if (prefill) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInputValue(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  useEffect(() => {
    pendingActionStackRef.current = pendingActionStack;
  }, [pendingActionStack]);

  const pendingActionIdentity = useMemo(() => ({
    userId: user?.id,
    workspaceId: workspace?.id,
    conversationId: activeId,
  }), [activeId, user?.id, workspace?.id]);

  const clearCurrentPendingAction = useCallback(() => {
    clearPendingAction(pendingActionIdentity);
    clearPendingActionStack(pendingActionIdentity);
  }, [pendingActionIdentity]);

  useEffect(() => {
    const conversationState = financialConversation.state;
    if (
      pendingActionStack?.actions?.length
      ||
      !pendingActionIdentity.userId
      || !pendingActionIdentity.workspaceId
      || !pendingActionIdentity.conversationId
      || !['needs_clarification', 'awaiting_confirmation'].includes(conversationState.status)
      || !conversationState.action
    ) {
      return;
    }
    savePendingAction(pendingActionIdentity, {
      parsed: conversationState.parsed,
      action: conversationState.action,
      response: conversationState.response,
      memory: conversationState.memory,
    });
  }, [financialConversation.state, pendingActionIdentity, pendingActionStack]);

  useEffect(() => {
    if (!pendingActionStack?.actions?.length) return;
    savePendingActionStack(pendingActionIdentity, pendingActionStack);
  }, [pendingActionIdentity, pendingActionStack]);

  useEffect(() => {
    const identityKey = [
      pendingActionIdentity.userId,
      pendingActionIdentity.workspaceId,
      pendingActionIdentity.conversationId,
    ].join(':');
    if (
      identityKey.includes('undefined')
      || restoredPendingIdentityRef.current === identityKey
      || accountState.isLoading
      || categoryState.isLoading
    ) {
      return;
    }
    restoredPendingIdentityRef.current = identityKey;
    const storedStack = loadPendingActionStack(pendingActionIdentity);
    const storedDependency = storedStack ? getActivePendingAction(storedStack) : null;
    if (isAccountCreationDependency(storedDependency)) {
      const parent = storedStack.actions.at(-2);
      const parentSnapshot = parent?.fields?.snapshot;
      if (parentSnapshot?.action && financialConversation.restore(parentSnapshot)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendingActionStack(storedStack);
      } else {
        clearPendingActionStack(pendingActionIdentity);
      }
      return;
    }

    const snapshot = loadPendingAction(pendingActionIdentity);
    if (!snapshot?.action) return;

    const accountId = snapshot.action.account?.id ?? snapshot.action.payload?.account_id;
    const categoryId = snapshot.action.category?.id ?? snapshot.action.payload?.category_id;
    const accountValid = !accountId || accountState.accounts.some((account) => account.id === accountId);
    const categoryValid = !categoryId || categoryState.categories.some((category) => category.id === categoryId);
    if (!accountValid || !categoryValid) {
      clearPendingAction(pendingActionIdentity);
      return;
    }

    if (financialConversation.restore(snapshot) && snapshot.action.status === 'ready') {
      if (storedStack?.actions?.length) {
        setPendingActionStack(storedStack);
      }
      setPendingAction(snapshot.action);
    }
  }, [
    accountState.accounts,
    accountState.isLoading,
    categoryState.categories,
    categoryState.isLoading,
    financialConversation,
    pendingActionIdentity,
  ]);

  const reconcileConversations = useCallback(async () => {
    if (!workspace?.id) return;
    const wsId = workspace.id;
    const supabaseConvs = await dataService.listConversations(wsId, mode);
    if (!supabaseConvs) return;
    setConnectionStatus(dataService.getConnectionStatus());

    setConversations((prev) => {
      const localIds = new Set(prev.map((c) => c.id));
      const dbIdSet = new Set(supabaseConvs.map((c) => c.id));
      const existingLocalIdsInDb = new Set(
        prev.filter((c) => c.source === 'supabase' && dbIdSet.has(c.id)).map((c) => c.id),
      );

      const merged = prev
        .filter((c) => c.source !== 'supabase' || dbIdSet.has(c.id))
        .map((c) => {
          if (c.source === 'supabase' && dbIdSet.has(c.id)) {
            const dbConv = supabaseConvs.find((db) => db.id === c.id);
            return { ...dbConv, messages: c.messages || [], source: 'supabase' };
          }
          return c;
        });

      const newDbIds = new Map(
        supabaseConvs.filter((c) => !localIds.has(c.id)).map((c) => [c.id, c]),
      );
      for (const [id, conv] of newDbIds) {
        if (!existingLocalIdsInDb.has(id)) {
          merged.push({ ...conv, messages: [], source: 'supabase' });
        }
      }

      const currentActive = activeIdRef.current;
      const activeExists = merged.some((c) => c.id === currentActive);
      if (!activeExists && merged.length > 0) {
        const targetMode = mode;
        const modeConvs = merged.filter((c) => c.mode === targetMode);
        const sorted = modeConvs.sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
        );
        if (sorted.length > 0) {
          const target = sorted[0];
          setTimeout(() => {
            switchConversation(target.id);
          }, 0);
        }
      }

      saveHistory(merged);
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, mode]);

  const buildWorkspaceMap = useCallback(() => {
    const map = {};
    if (availableWorkspaces && availableWorkspaces.length > 0) {
      for (const ws of availableWorkspaces) {
        if (ws.workspace_type === 'personal') map.personal = ws.id;
        if (ws.workspace_type === 'business') map.business = ws.id;
      }
    }
    return map;
  }, [availableWorkspaces]);

  useEffect(() => {
    if (initialLoadDone.current) return;
    if (!workspace?.id && !availableWorkspaces?.length) return;
    if (!availableWorkspaces?.length) return;
    initialLoadDone.current = true;

    const workspaceMap = buildWorkspaceMap();
    const hasAnyWorkspace = Object.values(workspaceMap).some(Boolean);

    if (!hasAnyWorkspace) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reconcileConversations();
      return;
    }

    dataService.migrateLocalHistory(workspaceMap).then((result) => {
      if (result.migrated > 0) {
        const stored = loadHistory();
        const synced = stored.filter(
          (c) => c.source !== 'local' || !c.messages || c.messages.length === 0,
        );
        if (synced.length !== stored.length) {
          saveHistory(synced);
        }
      }
      return reconcileConversations();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, availableWorkspaces?.length]);

  useEffect(() => {
    if (access.currentWorkspace === prevWorkspaceRef.current) return;
    prevWorkspaceRef.current = access.currentWorkspace;
    const correctMode = workspaceTypeToMode(access.currentWorkspace);
    if (correctMode === mode) return;
    uniVoice.stop();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoiceMessageId(null);
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    setConversations(updated);
    setMode(correctMode);
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setExecutionError(null);
    setIsExecutingAction(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    confirmingRef.current = false;
    financialConversation.reset();
    const candidates = updated
      .filter((c) => c.mode === correctMode)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (candidates.length > 0) {
      const c = candidates[0];
      setActiveId(c.id);
      setMessages(c.messages || []);
      saveActiveId(c.id);
    } else {
      setMessages([
        buildUniMessage(
          correctMode === 'empresa'
            ? 'Perfil alterado para Empresa. Vamos falar sobre o financeiro do seu negócio.'
            : 'Perfil alterado para Pessoal. Vamos falar sobre suas finanças pessoais.',
        ),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.currentWorkspace]);

  useEffect(() => {
    if (!activeId) return;
    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;
    const firstUser = messages.find((m) => m.from === 'user');
    const newTitle = firstUser
      ? (firstUser.text.length > 55 ? firstUser.text.slice(0, 55) + '\u2026' : firstUser.text)
      : '';
    if (current.messages === messages && current.title === (newTitle || '')) return;
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(updated);
  }, [messages, activeId, mode, conversations]);

  useEffect(() => {
    if (!activeId) return;
    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;
    if (current.source !== 'supabase') return;

    const requestId = ++loadRequestIdRef.current;

    dataService.loadMessages(activeId).then((loadedMessages) => {
      if (requestId !== loadRequestIdRef.current) return;
      if (!loadedMessages || loadedMessages.length === 0) return;
      if (activeIdRef.current !== activeId) return;

      setMessages((prev) => {
        if (prev.length === 0) return loadedMessages;
        if (prev.length < loadedMessages.length) return loadedMessages;
        return prev;
      });

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, messages: loadedMessages, _messagesLoaded: true } : c,
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const pendingSyncRef = useRef([]);

  async function syncMessageToSupabase(msg) {
    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;

    if (current.source === 'supabase') {
      await dataService.saveMessage(activeId, msg);
      const queued = pendingSyncRef.current.splice(0);
      for (const qMsg of queued) {
        await dataService.saveMessage(activeId, qMsg);
      }
      return;
    }

    if (!workspace?.id || !dataService.isOnline()) return;

    if (promotionInProgressRef.current) {
      pendingSyncRef.current.push(msg);
      return;
    }

    promotionInProgressRef.current = true;
    try {
      const dbConv = await dataService.createConversation(mode, workspace.id);
      if (!dbConv) return;

      const dbConvId = dbConv.id;
      const localConvId = activeId;
      const syncMsgs = [...messages, msg];
      await dataService.saveMessages(dbConvId, syncMsgs);

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== localConvId) return c;
          return {
            ...c,
            id: dbConvId,
            source: 'supabase',
            messages: syncMsgs,
            createdAt: dbConv.createdAt,
            updatedAt: dbConv.updatedAt,
          };
        }),
      );
      setActiveId(dbConvId);
      saveActiveId(dbConvId);
      saveActiveSource('supabase');
      convDbIdsRef.current[localConvId] = dbConvId;

      setConversations((prev) => prev.filter((c) => c.id !== localConvId));

      const stored = loadHistory();
      const updated = stored.map((c) => {
        if (c.id !== localConvId) return c;
        return {
          ...c,
          id: dbConvId,
          source: 'supabase',
          messages: syncMsgs,
          createdAt: dbConv.createdAt,
          updatedAt: dbConv.updatedAt,
        };
      });
      saveHistory(updated);

      const queued = pendingSyncRef.current.splice(0);
      for (const qMsg of queued) {
        await dataService.saveMessage(dbConvId, qMsg);
      }
    } finally {
      promotionInProgressRef.current = false;
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnectionStatus(dataService.getConnectionStatus());
    const unsub = dataService.subscribeConnectionStatus(setConnectionStatus);
    return unsub;
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < 80;
    if (stickToBottom.current) setShowScrollBtn(false);
  }

  function scrollToLatest() {
    stickToBottom.current = true;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setShowScrollBtn(false);
  }

  function pushMessage(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  function switchConversation(id) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;

    uniVoice.stop();
    setVoiceMessageId(null);

    const requestId = ++loadRequestIdRef.current;

    setActiveId(id);
    setMessages(conv.messages || []);
    const convMode = conv.mode || mode;
    if (convMode !== mode) {
      switchWorkspace(modeToWorkspaceType(convMode));
    }
    setMode(convMode);
    setIsTyping(false);
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setExecutionError(null);
    setIsExecutingAction(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    confirmingRef.current = false;
    financialConversation.reset();
    saveActiveId(id);
    saveActiveSource(conv.source || 'local');

    if (conv.source === 'supabase' && conv.messages && conv.messages.length > 0) {
      dataService.loadMessages(id).then((loadedMessages) => {
        if (requestId !== loadRequestIdRef.current) return;
        if (!loadedMessages || loadedMessages.length === 0) return;
        if (activeIdRef.current !== id) return;
        if (loadedMessages.length > conv.messages.length) {
          setMessages(loadedMessages);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === id ? { ...c, messages: loadedMessages } : c,
            ),
          );
        }
      });
    }
  }

  async function handleUnresolvedMessage(text, history) {
    lastUnresolvedRef.current = { text, history };
    let llmText = null;
    if (uniLlm.enabled) {
      setIsTyping(true);
      setAiStatus(AI_STATUS.LOADING);
      try {
        const outcome = await uniLlm.generateContextualResponse({
          text,
          messages: history,
          financialContext,
          mode,
          personalityProfileId,
          workspaceType: access.currentWorkspace,
        });
        llmText = outcome?.text ?? null;
      } catch {
        llmText = null;
      } finally {
        setIsTyping(false);
      }

      // Nunca mostra o aviso de erro/nova tentativa quando o proprio usuario
      // cancelou -- isso e uma acao deliberada, nao uma falha. O estado volta
      // a UNAVAILABLE (neutro), mas lastUnresolvedRef continua disponivel
      // para "tentar novamente" reaproveitar o mesmo texto.
      if (llmText) {
        setAiStatus(AI_STATUS.SUCCESS);
      } else if (aiCancelledRef.current) {
        // SUPORTE1: estado proprio (nunca ERROR) -- cancelamento deliberado
        // do usuario deve mostrar uma nota neutra, nunca o banner vermelho
        // de falha real (ErrorState variant="cancelled").
        setAiStatus(AI_STATUS.CANCELLED);
      } else {
        setAiStatus(AI_STATUS.ERROR);
      }
      aiCancelledRef.current = false;
    }
    const assistantMsg = buildUniMessage(llmText || UNI_DETERMINISTIC_FALLBACK_TEXT);
    pushMessage(assistantMsg);
    syncMessageToSupabase(assistantMsg);
  }

  function handleCancelAi() {
    if (aiStatus !== AI_STATUS.LOADING) return;
    aiCancelledRef.current = true;
    uniLlm.cancel();
  }

  function handleRetryAi() {
    const pending = lastUnresolvedRef.current;
    if (!pending || isTyping) return;
    setAiStatus(AI_STATUS.UNAVAILABLE);
    void handleUnresolvedMessage(pending.text, pending.history);
  }

  function findPendingConfirmationMessageId() {
    return [...messages]
      .reverse()
      .find((message) => message.confirmation?.status === 'pending')?.id ?? null;
  }

  function syncFinancialParentSnapshot(result, stack = pendingActionStackRef.current) {
    if (!stack?.actions?.length || !result?.action) return stack;
    const parent = stack.actions.find((action) => action.type === 'financial_transaction');
    if (!parent) return stack;
    const previousSnapshot = parent.fields?.snapshot ?? {};
    const transition = updateResumedFinancialSnapshot(stack, {
      ...previousSnapshot,
      action: result.action,
      response: result.response?.text ?? previousSnapshot.response ?? '',
    });
    if (transition.changed) {
      pendingActionStackRef.current = transition.stack;
      setPendingActionStack(transition.stack);
      return transition.stack;
    }
    return stack;
  }

  function publishConversationResult(result) {
    syncFinancialParentSnapshot(result);
    if (result?.action?.status === 'ready') {
      setPendingAction(result.action);
      const confirmation = buildConfirmationFromAction(
        result.action,
        access.currentWorkspace,
      );
      const assistantMsg = buildUniMessage(result.response.text, {
        type: 'confirmation',
        confirmation,
      });
      pushMessage(assistantMsg);
      syncMessageToSupabase(assistantMsg);
      return;
    }

    const assistantMsg = buildUniMessage(
      result?.response?.text
        || 'Preciso de mais detalhes antes de preparar essa ação.',
    );
    pushMessage(assistantMsg);
    syncMessageToSupabase(assistantMsg);
  }

  function publishAccountCreationConfirmation(stack) {
    const dependency = getActivePendingAction(stack);
    const confirmation = buildAccountCreationConfirmation(dependency, {
      accountTypes: accountState.accountTypes,
      workspaceType: access.currentWorkspace,
    });
    const assistantMsg = buildUniMessage(
      `Não encontrei a conta ${dependency.fields.account.name} neste espaço. Posso criá-la para continuar a movimentação?`,
      {
        type: 'confirmation',
        confirmation,
      },
    );
    pushMessage(assistantMsg);
    syncMessageToSupabase(assistantMsg);
  }

  function openAccountCreationDependency(proposal) {
    if (!proposal?.action?.proposedAccount) return false;
    const financialSnapshot = {
      parsed: proposal.parsed ?? financialConversation.state.parsed,
      action: proposal.action,
      response: proposal.response?.text ?? '',
      memory: proposal.memory ?? financialConversation.state.memory,
    };
    const transition = startAccountCreationDependency({
      stack: pendingActionStackRef.current,
      identity: pendingActionIdentity,
      financialSnapshot,
      proposedAccount: proposal.action.proposedAccount,
    });
    if (!transition.changed && transition.reason === 'duplicate') {
      return true;
    }

    pendingActionStackRef.current = transition.stack;
    setPendingActionStack(transition.stack);
    setPendingAction(null);
    publishAccountCreationConfirmation(transition.stack);
    return true;
  }

  function startAccountDependency(text) {
    const proposal = financialConversation.provideInput({
      accountName: text,
      accountDecision: 'create_new',
    });
    return openAccountCreationDependency(proposal);
  }

  function handlePendingConversationInput(text, userMsg) {
    const action = pendingAction ?? financialConversation.state.action;
    const activeStackAction = pendingActionStackRef.current
      ? getActivePendingAction(pendingActionStackRef.current)
      : null;
    const accountDependencyActive = isAccountCreationDependency(activeStackAction);
    const replyType = pendingAction || accountDependencyActive
      ? classifyPendingActionReply(text)
      : 'input';
    syncMessageToSupabase(userMsg);

    if (accountDependencyActive && replyType === 'confirm') {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) void handleConfirmAction(confirmationId);
      return true;
    }
    if (accountDependencyActive && (replyType === 'cancel' || isCancelEntirePendingFlow(text))) {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) {
        handleCancelAction(confirmationId, {
          cascade: isCancelEntirePendingFlow(text),
        });
      }
      return true;
    }
    if (accountDependencyActive) {
      const assistantMsg = buildUniMessage(
        'Para continuar, confirme a criação da conta, cancele apenas a criação ou diga “cancelar tudo”.',
      );
      pushMessage(assistantMsg);
      syncMessageToSupabase(assistantMsg);
      return true;
    }

    if (pendingAction && replyType === 'confirm') {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) void handleConfirmAction(confirmationId);
      return true;
    }
    if (pendingAction && replyType === 'cancel') {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) handleCancelAction(confirmationId);
      return true;
    }

    const resolvedInput = resolvePendingActionInput({
      value: text,
      action,
      accounts: accountState.accounts,
      categories: categoryState.categories,
      workspaceId: workspace?.id,
      referenceDate: getLocalIsoDate(),
    });
    if (resolvedInput.kind !== 'correction') {
      const accountNames = resolvedInput.accounts?.map((account) => account.name).filter(Boolean) ?? [];
      if (
        resolvedInput.kind === 'account_not_found'
        && startAccountDependency(text)
      ) {
        return true;
      }
      const message = resolvedInput.kind === 'ambiguous_account'
        ? `Encontrei mais de uma conta correspondente: ${accountNames.join(', ')}. Qual delas você quer usar?`
        : resolvedInput.kind === 'account_not_found'
          ? accountNames.length
            ? `Não encontrei essa conta no Espaço ${access.currentWorkspace === 'business' ? 'Empresa' : 'Pessoal'}. Contas disponíveis: ${accountNames.join(', ')}.`
            : `Não encontrei essa conta e não há contas disponíveis no Espaço ${access.currentWorkspace === 'business' ? 'Empresa' : 'Pessoal'}.`
          : pendingAction
            ? 'Para continuar, diga “confirmar”, “cancelar” ou informe o campo que deseja corrigir.'
            : financialConversation.state.response || 'Não consegui identificar esse dado. Tente informar de outra forma.';
      const assistantMsg = buildUniMessage(message);
      pushMessage(assistantMsg);
      syncMessageToSupabase(assistantMsg);
      return true;
    }

    if (pendingAction) {
      setMessages((current) => current.map((message) => (
        message.confirmation?.status === 'pending'
          ? { ...message, confirmation: { ...message.confirmation, status: 'updated' } }
          : message
      )));
      setPendingAction(null);
    }
    const result = financialConversation.provideInput(resolvedInput.overrides);
    publishConversationResult(result);
    return true;
  }

  function sendText(text) {
    if (!text.trim() || isTyping || isExecutingAction) return;
    setExecutionError(null);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    stickToBottom.current = true;
    const historySnapshot = messages;

    const userMsg = buildUserMessage(text);
    pushMessage(userMsg);
    setInputValue('');

    const hasPendingConversation = Boolean(
      pendingAction
      || isAccountCreationDependency(
        pendingActionStackRef.current
          ? getActivePendingAction(pendingActionStackRef.current)
          : null,
      )
      || financialConversation.state.status === 'needs_clarification',
    );
    if (hasPendingConversation) {
      handlePendingConversationInput(text, userMsg);
      return;
    }

    setIsTyping(true);
    syncMessageToSupabase(userMsg);

    setTimeout(() => {
      setIsTyping(false);

      const queryType = classifyFinancialQuery(text);

      if (queryType) {
        const isGoalQuery = String(queryType.type).startsWith('goal_')
          || queryType.type === 'required_monthly';
        const isLoading = isGoalQuery
          ? goalsState.isLoading
          : balanceState.isLoading || transactionsState.isLoading;
        const hasError = isGoalQuery
          ? goalsState.error
          : balanceState.error || transactionsState.error;

        if (isLoading) {
          pushMessage(buildUniMessage(
            'Ainda estou carregando os dados financeiros do seu workspace. Aguarde um momento e tente novamente.',
          ));
          return;
        }

        if (hasError) {
          pushMessage(buildUniMessage(
            'Não foi possível consultar os dados financeiros agora. Tente novamente mais tarde.',
          ));
          return;
        }

        if (!isGoalQuery && !financialContext.hasData) {
          pushMessage(buildUniMessage(
            'Seu workspace ainda não possui dados financeiros. Cadastre uma conta ou transação para começar.',
          ));
          return;
        }

        const response = buildQueryResponse(queryType, financialContext, mode, {
          projections: futureProjections,
          goalProjections: futureProjections.goalProjections,
          goals: goalsState.goals,
        });
        if (response) {
          const assistantMsg = buildUniMessage(response.text, { highlight: response.highlight });
          pushMessage(assistantMsg);
          syncMessageToSupabase(assistantMsg);
          return;
        }
      }

      const result = financialConversation.interpret(text);

      if (!result.handled) {
        if (['register_transfer', 'create_goal'].includes(result.parsed?.intent)) {
          const unsupportedMsg = buildUniMessage(
            result.parsed.intent === 'create_goal'
              ? 'Ainda não posso criar objetivos pela conversa com segurança. Posso consultar seus objetivos ou orientar você a criá-los na área de Objetivos.'
              : 'Transferências ainda não podem ser registradas pela Uni. Use o Financeiro para manter origem e destino sob sua revisão.',
          );
          pushMessage(unsupportedMsg);
          syncMessageToSupabase(unsupportedMsg);
          return;
        }
        // Perguntas sobre futuro/tendência/continuidade financeira que não
        // batem com nenhum tipo suportado por classifyFinancialQuery NUNCA
        // vão ao LLM: ele inventaria números. Resposta determinística e
        // transparente, sem valor/prazo/percentual fabricado.
        if (detectFutureFinancialIntent(text)) {
          const safeMsg = buildUniMessage(buildFutureSafetyResponse(futureProjections.hasHistory));
          pushMessage(safeMsg);
          syncMessageToSupabase(safeMsg);
          return;
        }
        void handleUnresolvedMessage(text, historySnapshot);
        return;
      }

      if (result.action?.proposedAccount && openAccountCreationDependency(result)) {
        return;
      }
      publishConversationResult(result);
    }, UNI_THINK_MIN_MS);
  }

  function handleSuggestionSelect(item) {
    sendText(item.label);
  }

  function handleModeChange(next) {
    if (next === mode) return;
    uniVoice.stop();
    setVoiceMessageId(null);
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    setConversations(updated);
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setExecutionError(null);
    setIsExecutingAction(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    confirmingRef.current = false;
    financialConversation.reset();
    const candidates = conversations
      .filter((c) => c.mode === next)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (candidates.length > 0) {
      switchConversation(candidates[0].id);
    } else {
      setMode(next);
      setMessages([]);
      setActiveId(null);
      setIsTyping(false);
      const conv = createLocalConversation(next);
      setConversations((prev) => {
        const nextList = [...prev, conv];
        saveHistory(nextList);
        return nextList;
      });
      setActiveId(conv.id);
      saveActiveId(conv.id);
      pushMessage(buildUniMessage(
        next === 'empresa'
          ? 'Perfil alterado para Empresa. Vamos falar sobre o financeiro do seu negócio.'
          : 'Perfil alterado para Pessoal. Vamos falar sobre suas finanças pessoais.',
      ));
    }
    switchWorkspace(modeToWorkspaceType(next));
  }

  function handleNewChat() {
    uniVoice.stop();
    setVoiceMessageId(null);
    const updated = persistConversation(conversations, activeId, messages, mode);
    const conv = createLocalConversation(mode);
    const nextList = [...updated, conv];
    saveHistory(nextList);
    saveActiveId(conv.id);
    setConversations(nextList);
    setActiveId(conv.id);
    setMessages([]);
    setIsTyping(false);
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setExecutionError(null);
    setIsExecutingAction(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    confirmingRef.current = false;
    financialConversation.reset();
    stickToBottom.current = true;
  }

  function handleSelectConversation(id) {
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    setConversations(updated);
    switchConversation(id);
  }

  async function handleDeleteConversation(id) {
    const deletingActive = id === activeId;

    if (dataService.isOnline()) {
      const current = conversations.find((c) => c.id === id);
      if (current?.source === 'supabase') {
        await dataService.deleteConversation(id);
      }
    }

    const withRemoval = conversations.filter((c) => c.id !== id);
    if (deletingActive) {
      uniVoice.stop();
      setVoiceMessageId(null);
      const conv = createLocalConversation(mode);
      const nextList = [...withRemoval, conv];
      setConversations(nextList);
      setActiveId(conv.id);
      setMessages([]);
      setPendingAction(null);
      pendingActionStackRef.current = null;
      setPendingActionStack(null);
      setExecutionError(null);
      setIsExecutingAction(false);
      setAiStatus(AI_STATUS.UNAVAILABLE);
      lastUnresolvedRef.current = null;
      confirmingRef.current = false;
      financialConversation.reset();
      saveHistory(nextList);
      saveActiveId(conv.id);
    } else {
      setConversations(withRemoval);
      saveHistory(withRemoval);
    }
  }

  async function handleConfirmAction(id) {
    if (confirmingRef.current) return;
    const stack = pendingActionStackRef.current;
    const activeStackAction = stack ? getActivePendingAction(stack) : null;
    const accountDependencyActive = isAccountCreationDependency(activeStackAction);
    if (!pendingAction && !accountDependencyActive) return;

    confirmingRef.current = true;
    setIsExecutingAction(true);
    setExecutionError(null);

    try {
      if (accountDependencyActive) {
        const requestedAccount = activeStackAction.fields.account;
        const conflicts = findAccountCreationConflicts({
          accounts: accountState.accounts,
          requestedName: requestedAccount.name,
          workspaceId: workspace?.id,
        });

        if (conflicts.exact.length > 1 || conflicts.similar.length) {
          const candidates = [...conflicts.exact, ...conflicts.similar];
          const names = candidates.map((account) => account.name).join(', ');
          const errorText = `Encontrei conta semelhante neste espaço: ${names}. Cancele a criação e escolha uma dessas contas.`;
          setExecutionError(errorText);
          setMessages((prev) => prev.map((message) => (
            message.id === id
              ? {
                  ...message,
                  confirmation: { ...message.confirmation, confirmationError: errorText },
                }
              : message
          )));
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
        }

        let dependencyOutcome;
        if (conflicts.exact.length === 1) {
          dependencyOutcome = completeAccountCreationDependency(
            stack,
            conflicts.exact[0],
          );
        } else {
          dependencyOutcome = await accountDependencyCoordinator.execute(stack);
        }

        if (
          dependencyOutcome?.error
          || !dependencyOutcome?.completedAction?.result?.id
          || !dependencyOutcome?.resumedAction
        ) {
          const errorText = 'Não consegui criar essa conta. A movimentação foi preservada.';
          setExecutionError(errorText);
          setMessages((prev) => prev.map((message) => (
            message.id === id
              ? {
                  ...message,
                  confirmation: { ...message.confirmation, confirmationError: errorText },
                }
              : message
          )));
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
        }

        const account = dependencyOutcome.completedAction.result;
        const parentSnapshot = dependencyOutcome.resumedAction.fields.snapshot;
        financialConversation.restore(parentSnapshot);
        const resumedResult = financialConversation.provideInput({
          accountId: account.id,
          accountRecord: account,
        });
        const resumedSnapshot = {
          ...parentSnapshot,
          action: resumedResult.action,
          response: resumedResult.response?.text ?? parentSnapshot.response,
        };
        const updatedStack = updateResumedFinancialSnapshot(
          dependencyOutcome.stack,
          resumedSnapshot,
        ).stack;
        pendingActionStackRef.current = updatedStack;
        setPendingActionStack(updatedStack);
        setMessages((prev) => prev.map((message) => (
          message.id === id
            ? { ...message, confirmation: { ...message.confirmation, status: 'confirmed' } }
            : message
        )));
        const accountMessage = buildUniMessage(
          conflicts.exact.length
            ? `A conta ${account.name} já existia neste espaço. Retomei a movimentação sem duplicá-la.`
            : `Conta ${account.name} criada. Retomei a movimentação do ponto em que paramos.`,
        );
        pushMessage(accountMessage);
        syncMessageToSupabase(accountMessage);
        publishConversationResult(resumedResult);
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }

      const outcome = await financialConversation.confirm();

      if (!confirmingRef.current) return;
      if (!outcome || outcome.result?.error || !outcome.result?.data) {
        const errorText = outcome?.response?.text
          || 'Não consegui registrar essa movimentação. Tente novamente.';
        setExecutionError(errorText);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, confirmation: { ...m.confirmation, confirmationError: errorText } }
              : m,
          ),
        );
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }

      const successText = outcome.response?.text
        || 'Prontinho! Registrei essa movimentação para você.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, confirmation: { ...m.confirmation, status: 'confirmed' } }
            : m,
        ),
      );
      const successMessage = buildUniMessage(successText);
      pushMessage(successMessage);
      syncMessageToSupabase(successMessage);
      financialConversation.reset();
      clearCurrentPendingAction();
      pendingActionStackRef.current = null;
      setPendingActionStack(null);
      setPendingAction(null);
      setIsExecutingAction(false);
      confirmingRef.current = false;
      notifyFinancialDataChanged('uni-chat');
    } catch {
      if (!confirmingRef.current) return;
      const errorText = 'Ocorreu um erro inesperado. Tente novamente.';
      setExecutionError(errorText);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, confirmation: { ...m.confirmation, confirmationError: errorText } }
            : m,
        ),
      );
      setIsExecutingAction(false);
      confirmingRef.current = false;
    }
  }

  function handleEditAction() {
    setInputValue('Quero alterar o valor para ');
  }

  function handleCancelAction(id, { cascade = false } = {}) {
    const stack = pendingActionStackRef.current;
    const activeStackAction = stack ? getActivePendingAction(stack) : null;
    if (isAccountCreationDependency(activeStackAction)) {
      const transition = cancelAccountCreationDependency(stack, { cascade });
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id
            ? { ...message, confirmation: { ...message.confirmation, status: 'canceled' } }
            : message,
        ),
      );
      setExecutionError(null);
      setIsExecutingAction(false);
      confirmingRef.current = false;

      if (cascade || !transition.resumedAction) {
        pendingActionStackRef.current = null;
        setPendingActionStack(null);
        setPendingAction(null);
        financialConversation.cancel();
        clearCurrentPendingAction();
        pushMessage(buildUniMessage('Tudo bem. Cancelei a criação da conta e a movimentação.'));
        return;
      }

      pendingActionStackRef.current = transition.stack;
      setPendingActionStack(transition.stack);
      setPendingAction(null);
      financialConversation.restore(transition.resumedAction.fields.snapshot);
      pushMessage(buildUniMessage(
        'Tudo bem. Não criei a conta. A movimentação continua preservada; informe outra conta para continuar.',
      ));
      return;
    }

    confirmingRef.current = false;
    setIsExecutingAction(false);
    setPendingAction(null);
    setExecutionError(null);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, confirmation: { ...m.confirmation, status: 'canceled' } }
          : m,
      ),
    );
    pushMessage(buildUniMessage('Sem problemas, cancelei esse registro.'));
    financialConversation.cancel();
    clearCurrentPendingAction();
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
  }

  function handleBeforeVoiceStart() {
    uniVoice.stop();
    setVoiceMessageId(null);
  }

  const isEmpty = messages.length === 0;
  const filteredConversations = conversations.filter((c) => c.mode === mode);

  return (
    <div className={styles.page}>
      <ChatHeader
        mode={mode}
        onModeChange={handleModeChange}
        onHistory={() => setShowHistory(true)}
        onNewChat={handleNewChat}
        isThinking={isTyping}
      />

      {connectionStatus === 'offline' && (
        <div className={styles.offlineBanner} role="status">
          Modo offline — as mensagens serão salvas localmente
        </div>
      )}
      {connectionStatus === 'reconnecting' && (
        <div className={styles.reconnectBanner} role="status">
          Reconectando…
        </div>
      )}

      <HistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        onNewChat={handleNewChat}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        conversations={filteredConversations}
        activeId={activeId}
      />

      <div className={styles.body} ref={scrollRef} onScroll={handleScroll}>
        {isEmpty ? (
          <EmptyState userName={resolveGreetingName(profile)} suggestions={suggestions} onSelect={handleSuggestionSelect} workspaceType={access.currentWorkspace} />
        ) : (
          <div className={styles.messages}>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onConfirmAction={handleConfirmAction}
                onEditAction={handleEditAction}
                onCancelAction={handleCancelAction}
                isExecuting={isExecutingAction}
                executionError={message.confirmation?.status === 'pending' ? executionError : null}
                voiceEnabled={voicePreference.enabled}
                voiceStatus={uniVoice.status}
                voiceError={uniVoice.error}
                isActiveVoiceMessage={voiceMessageId === message.id}
                onSpeakMessage={handleSpeakMessage}
                onPauseResumeVoice={handlePauseResumeVoice}
                onStopVoice={handleStopVoice}
              />
            ))}
            {isTyping && (
              <>
                <TypingIndicator />
                {aiStatus === AI_STATUS.LOADING && (
                  <button
                    type="button"
                    className={styles.cancelAiButton}
                    onClick={handleCancelAi}
                  >
                    Cancelar resposta
                  </button>
                )}
              </>
            )}
            {!isTyping && aiStatus === AI_STATUS.ERROR && (
              <ErrorState onRetry={handleRetryAi} />
            )}
            {!isTyping && aiStatus === AI_STATUS.CANCELLED && (
              <ErrorState variant="cancelled" />
            )}
            <div ref={bottomRef} />
          </div>
        )}

        <ScrollToLatest visible={showScrollBtn && !isEmpty} onClick={scrollToLatest} />
      </div>

      <div className={styles.footer}>
        {!isEmpty && (
          <QuickSuggestions items={suggestions} onSelect={handleSuggestionSelect} variant="rail" />
        )}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={sendText}
          onBeforeVoiceStart={handleBeforeVoiceStart}
          disabled={isTyping || isExecutingAction}
        />
      </div>
    </div>
  );
}
