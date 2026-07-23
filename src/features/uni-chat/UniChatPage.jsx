import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildUniPrefillFromState } from '../categories/categoryUtils.js';
import { useAccess } from '../../app/AccessContext';
import { useSession } from '../../app/SessionContext';
import { useUniConversation } from '../uni-conversation';
import { useUniLlm } from '../uni-llm';
import { useUniVoiceOutput } from '../uni-voice-output';
import { useAccounts, useCategories, useTransactions, useFinancialBalances } from '../../hooks';
import { useGoals } from '../goals/useGoals';
import { buildFutureProjections } from '../future/futureService';
import { useUniChatFinancialData } from './useUniChatFinancialData';
import { classifyFinancialQuery, buildQueryResponse } from './financialQueryInterpreter';
import ChatHeader from './components/ChatHeader';
import EmptyState from './components/EmptyState';
import MessageBubble from './components/MessageBubble';
import TypingIndicator from './components/TypingIndicator';
import QuickSuggestions from './components/QuickSuggestions';
import ChatInput from './components/ChatInput';

import ScrollToLatest from './components/ScrollToLatest';
import HistoryPanel from './components/HistoryPanel';
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
import * as dataService from './uniChatDataService';
import styles from './UniChatPage.module.css';

const UNI_THINK_MIN_MS = 600;

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
  const { profile, workspace, switchWorkspace, availableWorkspaces } = useSession();
  const location = useLocation();
  const initialContextRef = useRef(false);

  const personalityProfileId = profile?.uni_personality_profile ?? 'balanced';

  const voiceOutput = useUniVoiceOutput({ personalityProfileId });
  const uniLlm = useUniLlm();
  const [speakingId, setSpeakingId] = useState(null);

  const handleSpeakMessage = useCallback((message) => {
    if (!message?.text) return;
    if (speakingId === message.id) {
      voiceOutput.stop();
      setSpeakingId(null);
      return;
    }
    voiceOutput.stop();
    setSpeakingId(message.id);
    const settle = () =>
      setSpeakingId((current) => (current === message.id ? null : current));
    const playback = voiceOutput.premiumSupported
      ? voiceOutput.speakPremium(message.text, { fallbackText: message.text })
      : voiceOutput.speakBrowser(message.text);
    Promise.resolve(playback).finally(settle);
  }, [speakingId, voiceOutput]);

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
    executeAtomicAction: null,
    saveAccount: accountState.saveAccount,
    saveTransaction: transactionsState.saveTransaction,
    profileId: personalityProfileId,
    workspaceType: access.currentWorkspace,
    referenceDate: getLocalIsoDate(),
  });

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
  const [executionError, setExecutionError] = useState(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const confirmingRef = useRef(false);
  const pendingActionRef = useRef(null);
  const activeIdRef = useRef(activeId);
  const convDbIdsRef = useRef({});

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

  const isConfirming = pendingAction != null;

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
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(updated);
    setMode(correctMode);
    setPendingAction(null);
    setExecutionError(null);
    setIsExecutingAction(false);
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

    voiceOutput.stop();
    setSpeakingId(null);

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
    setExecutionError(null);
    setIsExecutingAction(false);
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
    let llmText = null;
    if (uniLlm.enabled) {
      setIsTyping(true);
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
    }
    const assistantMsg = buildUniMessage(llmText || UNI_DETERMINISTIC_FALLBACK_TEXT);
    pushMessage(assistantMsg);
    syncMessageToSupabase(assistantMsg);
  }

  function sendText(text) {
    if (!text.trim() || isTyping || isConfirming) return;
    setExecutionError(null);
    stickToBottom.current = true;
    const historySnapshot = messages;

    const userMsg = buildUserMessage(text);
    pushMessage(userMsg);
    setInputValue('');
    setIsTyping(true);

    syncMessageToSupabase(userMsg);

    setTimeout(() => {
      setIsTyping(false);

      const queryType = classifyFinancialQuery(text);

      if (queryType) {
        const isLoading = balanceState.isLoading || transactionsState.isLoading;
        const hasError = balanceState.error || transactionsState.error;

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

        if (!financialContext.hasData) {
          pushMessage(buildUniMessage(
            'Seu workspace ainda não possui dados financeiros. Cadastre uma conta ou transação para começar.',
          ));
          return;
        }

        const response = buildQueryResponse(queryType, financialContext, mode, {
          projections: futureProjections,
          goalProjections: futureProjections.goalProjections,
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
        void handleUnresolvedMessage(text, historySnapshot);
        return;
      }

      if (result.action?.status === 'ready') {
        setPendingAction(result.action);
        const confirmation = buildConfirmationFromAction(result.action);
        const assistantMsg = buildUniMessage(result.response.text, {
          type: 'confirmation',
          confirmation,
        });
        pushMessage(assistantMsg);
        syncMessageToSupabase(assistantMsg);
      } else {
        const assistantMsg = buildUniMessage(result.response.text);
        pushMessage(assistantMsg);
        syncMessageToSupabase(assistantMsg);
      }
    }, UNI_THINK_MIN_MS);
  }

  function handleSuggestionSelect(item) {
    sendText(item.label);
  }

  function handleModeChange(next) {
    if (next === mode) return;
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    setConversations(updated);
    setPendingAction(null);
    setExecutionError(null);
    setIsExecutingAction(false);
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
    voiceOutput.stop();
    setSpeakingId(null);
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
    setExecutionError(null);
    setIsExecutingAction(false);
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
      const conv = createLocalConversation(mode);
      const nextList = [...withRemoval, conv];
      setConversations(nextList);
      setActiveId(conv.id);
      setMessages([]);
      setPendingAction(null);
      setExecutionError(null);
      setIsExecutingAction(false);
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
    if (!pendingAction) return;

    confirmingRef.current = true;
    setIsExecutingAction(true);
    setExecutionError(null);

    try {
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
      pushMessage(buildUniMessage(successText));
      financialConversation.reset();
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

  function handleCancelAction(id) {
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
                canSpeak={message.from === 'uni'}
                onSpeak={handleSpeakMessage}
                isSpeaking={speakingId === message.id}
              />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}

        <ScrollToLatest visible={showScrollBtn && !isEmpty} onClick={scrollToLatest} />
      </div>

      <div className={styles.footer}>
        {!isEmpty && (
          <QuickSuggestions items={suggestions} onSelect={handleSuggestionSelect} variant="rail" />
        )}
        <ChatInput value={inputValue} onChange={setInputValue} onSend={sendText} disabled={isTyping || isConfirming || isExecutingAction} personalityProfileId={personalityProfileId} />
      </div>
    </div>
  );
}
