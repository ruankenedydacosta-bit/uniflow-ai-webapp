import { useEffect, useRef, useState } from 'react';
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
  generateUniResponse,
  nextId,
} from './mockData';
import {
  loadHistory,
  saveHistory,
  loadActiveId,
  saveActiveId,
  createConversation,
  persistConversation,
} from './chatHistory';
import styles from './UniChatPage.module.css';

const UNI_THINK_DELAY = 900;

const SAVE = {
  conversations(prev, id, msgs, m) {
    const updated = persistConversation(prev, id, msgs, m);
    saveHistory(updated);
    return updated;
  },
};

function boot() {
  const stored = loadHistory();
  const storedId = loadActiveId();

  let convs = stored;
  let id = storedId;
  let msgs = [];
  let md = 'pessoal';

  if (storedId) {
    const active = stored.find((c) => c.id === storedId);
    if (active) {
      msgs = active.messages || [];
      md = active.mode || 'pessoal';
    } else {
      id = null;
    }
  }

  if (!id) {
    const conv = createConversation('pessoal');
    convs = [...stored, conv];
    id = conv.id;
    saveHistory(convs);
    saveActiveId(conv.id);
  }

  return { conversations: convs, activeId: id, messages: msgs, mode: md };
}

const INIT = boot();

export default function UniChatPage() {
  const [mode, setMode] = useState(INIT.mode);
  const [messages, setMessages] = useState(INIT.messages);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [lastFailedText, setLastFailedText] = useState(null);
  const [conversations, setConversations] = useState(INIT.conversations);
  const [activeId, setActiveId] = useState(INIT.activeId);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottom = useRef(true);

  const suggestions = mode === 'pessoal' ? SUGGESTIONS_PESSOAL : SUGGESTIONS_EMPRESA;

  useEffect(() => {
    if (!activeId) return;
    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;
    const firstUser = messages.find((m) => m.from === 'user');
    const newTitle = firstUser
      ? (firstUser.text.length > 55 ? firstUser.text.slice(0, 55) + '\u2026' : firstUser.text)
      : '';
    if (current.messages === messages && current.title === (newTitle || '')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations((prev) => SAVE.conversations(prev, activeId, messages, mode));
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
    setMode(conv.mode || mode);
    setHasError(false);
    setIsTyping(false);
    stickToBottom.current = true;
    saveActiveId(id);
  }

  function sendText(text) {
    if (!text.trim()) return;
    setHasError(false);
    stickToBottom.current = true;

    const userMsg = {
      id: nextId(),
      from: 'user',
      type: 'text',
      text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    pushMessage(userMsg);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      if (text.toLowerCase().includes('erro')) {
        setHasError(true);
        setLastFailedText(text);
        return;
      }
      const uniMessages = generateUniResponse(text, mode);
      uniMessages.forEach((m) => pushMessage(m));
    }, UNI_THINK_DELAY);
  }

  function handleRetry() {
    setHasError(false);
    if (lastFailedText) sendText(lastFailedText.replace(/erro/gi, '').trim() || 'tentar novamente');
  }

  function handleSuggestionSelect(item) {
    sendText(item.label);
  }

  function handleModeChange(next) {
    if (next === mode) return;

    setConversations((prev) => SAVE.conversations(prev, activeId, messages, mode));
    setMode(next);

    const candidates = conversations
      .filter((c) => c.mode === next)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (candidates.length > 0) {
      switchConversation(candidates[0].id);
    } else {
      setHasError(false);
      setIsTyping(false);
      pushMessage({
        id: nextId(),
        from: 'uni',
        type: 'text',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text:
          next === 'empresa'
            ? 'Perfil alterado para Empresa. Vamos falar sobre o financeiro do seu negócio.'
            : 'Perfil alterado para Pessoal. Vamos falar sobre suas finanças pessoais.',
      });
    }
  }

  function handleNewChat() {
    setConversations((prev) => SAVE.conversations(prev, activeId, messages, mode));

    const conv = createConversation(mode);
    setConversations((prev) => {
      const updated = [...prev, conv];
      saveHistory(updated);
      saveActiveId(conv.id);
      return updated;
    });
    setActiveId(conv.id);
    setMessages([]);
    setHasError(false);
    setIsTyping(false);
    stickToBottom.current = true;
  }

  function handleSelectConversation(id) {
    setConversations((prev) => SAVE.conversations(prev, activeId, messages, mode));
    switchConversation(id);
  }

  function handleDeleteConversation(id) {
    const deletingActive = id === activeId;
    const withRemoval = conversations.filter((c) => c.id !== id);

    if (deletingActive) {
      const conv = createConversation(mode);
      const updated = [...withRemoval, conv];
      setConversations(updated);
      setActiveId(conv.id);
      setMessages([]);
      setHasError(false);
      saveHistory(updated);
      saveActiveId(conv.id);
    } else {
      setConversations(withRemoval);
      saveHistory(withRemoval);
    }
  }

  function updateConfirmation(id, status, followUpText) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, confirmation: { ...m.confirmation, status } } : m
      )
    );
    if (followUpText) {
      pushMessage({
        id: nextId(),
        from: 'uni',
        type: 'text',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: followUpText,
      });
    }
  }

  function handleConfirmAction(id) {
    updateConfirmation(id, 'confirmed', 'Prontinho! Registrei essa movimentação para você.');
  }

  function handleEditAction() {
    setInputValue('Quero alterar o valor para ');
  }

  function handleCancelAction(id) {
    updateConfirmation(id, 'canceled', 'Sem problemas, cancelei esse registro.');
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
        <ChatInput value={inputValue} onChange={setInputValue} onSend={sendText} disabled={isTyping} />
      </div>
    </div>
  );
}
