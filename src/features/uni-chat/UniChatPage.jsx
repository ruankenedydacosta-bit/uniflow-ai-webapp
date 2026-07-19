import { useEffect, useRef, useState } from 'react';
import { useAccess } from '../../app/AccessContext';
import { useSession } from '../../app/SessionContext';
import { useUniConversation } from '../uni-conversation';
import { useAccounts, useCategories, useTransactions, useFinancialBalances } from '../../hooks';
import { useUniChatFinancialData } from './useUniChatFinancialData';
import { classifyFinancialQuery, buildQueryResponse } from './financialQueryInterpreter';
import ChatHeader from './components/ChatHeader';
import EmptyState from './components/EmptyState';
import MessageBubble from './components/MessageBubble';
import TypingIndicator from './components/TypingIndicator';
import QuickSuggestions from './components/QuickSuggestions';
import ChatInput from './components/ChatInput';
import ErrorState from './components/ErrorState';
import ScrollToLatest from './components/ScrollToLatest';
import HistoryPanel from './components/HistoryPanel';
import {
  USER_NAME,
  SUGGESTIONS_PESSOAL,
  SUGGESTIONS_EMPRESA,
} from './mockData';
import {
  loadHistory,
  saveHistory,
  loadActiveId,
  saveActiveId,
  createConversation,
  persistConversation,
} from './chatHistory';
import {
  buildUserMessage,
  buildUniMessage,
  buildConfirmationFromAction,
  workspaceTypeToMode,
  modeToWorkspaceType,
} from './uniChatAdapter';
import { financialCrudMock, fallbackAccountTypes } from '../../pages/financeiro/financialCrud.mock';
import styles from './UniChatPage.module.css';

const UNI_THINK_MIN_MS = 600;

function getLocalIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function UniChatPage() {
  const { access } = useAccess();
  const { profile, workspace, switchWorkspace } = useSession();

  const personalityProfileId = profile?.uni_personality_profile ?? 'balanced';

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
  });

  const transactionsState = useTransactions({
    workspaceId: workspace?.id,
    fallbackTransactions: financialFallback.transactions,
  });

  const balanceState = useFinancialBalances({ workspaceId: workspace?.id });

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
    saveAccount: null,
    saveTransaction: null,
    profileId: personalityProfileId,
    workspaceType: access.currentWorkspace,
    referenceDate: getLocalIsoDate(),
  });

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
  const [hasError, setHasError] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [conversations, setConversations] = useState(() => {
    const stored = loadHistory();
    const storedId = loadActiveId();
    if (storedId && stored.some((c) => c.id === storedId)) return stored;
    const initMode = workspaceTypeToMode(access.currentWorkspace);
    const conv = createConversation(initMode);
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
    const conv = createConversation(initMode);
    const updated = [...stored, conv];
    saveHistory(updated);
    saveActiveId(conv.id);
    return conv.id;
  });
  const [pendingAction, setPendingAction] = useState(null);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottom = useRef(true);
  const prevWorkspaceRef = useRef(access.currentWorkspace);

  const suggestions = mode === 'pessoal' ? SUGGESTIONS_PESSOAL : SUGGESTIONS_EMPRESA;
  const isConfirming = pendingAction != null;

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
    setActiveId(id);
    setMessages(conv.messages || []);
    const convMode = conv.mode || mode;
    if (convMode !== mode) {
      switchWorkspace(modeToWorkspaceType(convMode));
    }
    setMode(convMode);
    setHasError(false);
    setIsTyping(false);
    setPendingAction(null);
    financialConversation.reset();
    saveActiveId(id);
  }

  function sendText(text) {
    if (!text.trim() || isTyping || isConfirming) return;
    setHasError(false);
    stickToBottom.current = true;

    const userMsg = buildUserMessage(text);
    pushMessage(userMsg);
    setInputValue('');
    setIsTyping(true);

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

        const response = buildQueryResponse(queryType, financialContext, mode);
        if (response) {
          pushMessage(buildUniMessage(response.text, { highlight: response.highlight }));
          return;
        }
      }

      const result = financialConversation.interpret(text);

      if (!result.handled) {
        pushMessage(buildUniMessage(
          'Entendi. Por enquanto, posso ajudar a registrar movimentações financeiras. Tente algo como "registrar uma despesa de R$ 50" ou "qual meu saldo?".',
        ));
        return;
      }

      if (result.action?.status === 'ready') {
        setPendingAction(result.action);
        const confirmation = buildConfirmationFromAction(result.action);
        pushMessage(buildUniMessage(result.response.text, {
          type: 'confirmation',
          confirmation,
        }));
      } else {
        pushMessage(buildUniMessage(result.response.text));
      }
    }, UNI_THINK_MIN_MS);
  }

  function handleRetry() {
    setHasError(false);
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
      setHasError(false);
      const conv = createConversation(next);
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
    const updated = persistConversation(conversations, activeId, messages, mode);
    const conv = createConversation(mode);
    const nextList = [...updated, conv];
    saveHistory(nextList);
    saveActiveId(conv.id);
    setConversations(nextList);
    setActiveId(conv.id);
    setMessages([]);
    setHasError(false);
    setIsTyping(false);
    setPendingAction(null);
    financialConversation.reset();
    stickToBottom.current = true;
  }

  function handleSelectConversation(id) {
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    setConversations(updated);
    switchConversation(id);
  }

  function handleDeleteConversation(id) {
    const deletingActive = id === activeId;
    const withRemoval = conversations.filter((c) => c.id !== id);
    if (deletingActive) {
      const conv = createConversation(mode);
      const nextList = [...withRemoval, conv];
      setConversations(nextList);
      setActiveId(conv.id);
      setMessages([]);
      setHasError(false);
      setPendingAction(null);
      financialConversation.reset();
      saveHistory(nextList);
      saveActiveId(conv.id);
    } else {
      setConversations(withRemoval);
      saveHistory(withRemoval);
    }
  }

  function handleConfirmAction(id) {
    if (!pendingAction) return;
    setPendingAction(null);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, confirmation: { ...m.confirmation, status: 'confirmed' } }
          : m,
      ),
    );
    pushMessage(buildUniMessage('Prontinho! Registrei essa movimentação para você.'));
    financialConversation.reset();
  }

  function handleEditAction() {
    setInputValue('Quero alterar o valor para ');
  }

  function handleCancelAction(id) {
    setPendingAction(null);
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
          <EmptyState userName={USER_NAME} suggestions={suggestions} onSelect={handleSuggestionSelect} />
        ) : (
          <div className={styles.messages}>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onConfirmAction={handleConfirmAction}
                onEditAction={handleEditAction}
                onCancelAction={handleCancelAction}
              />
            ))}
            {isTyping && <TypingIndicator />}
            {hasError && <ErrorState onRetry={handleRetry} />}
            <div ref={bottomRef} />
          </div>
        )}

        <ScrollToLatest visible={showScrollBtn && !isEmpty} onClick={scrollToLatest} />
      </div>

      <div className={styles.footer}>
        {!isEmpty && (
          <QuickSuggestions items={suggestions} onSelect={handleSuggestionSelect} variant="rail" />
        )}
        <ChatInput value={inputValue} onChange={setInputValue} onSend={sendText} disabled={isTyping || isConfirming} />
      </div>
    </div>
  );
}
