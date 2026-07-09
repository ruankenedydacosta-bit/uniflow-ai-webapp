import { useState } from 'react';
import { cx } from '../../lib/cx';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import ConversationList from './ConversationList';
import ChatHeader from './ChatHeader';
import ChatEmptyState from './ChatEmptyState';
import ChatLoading from './ChatLoading';
import ChatError from './ChatError';
import ChatInput from './ChatInput';
import ScrollToBottom from './ScrollToBottom';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import { useConversations } from './useConversations';
import { useChat } from './useChat';
import { useAutoScroll } from './useAutoScroll';
import { MESSAGE_ROLE } from './constants';
import styles from './ChatWindow.module.css';

/**
 * ChatWindow — Módulo 10 (Uni) completo: lista de conversas + conversa
 * ativa + input com voz/upload + streaming + auto-scroll. Ponto único de
 * composição — todo o resto do módulo é implementação de detalhe usada
 * por este componente.
 *
 * @param {{ userId: string }} props
 */
export default function ChatWindow({ userId }) {
  const { desktop } = useBreakpoint();
  const [listOpen, setListOpen] = useState(false);
  const [activeConversation, setActiveConversation] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { conversations, loading: conversationsLoading, createConversation } = useConversations(userId);
  const { messages, sending, error, sendMessage, uploadFile, loadHistory } = useChat({
    conversaId: activeConversation?.id,
    userId,
  });
  const { containerRef, handleScroll, showScrollButton, scrollToBottom } = useAutoScroll(messages);

  async function handleSelectConversation(conversation) {
    setActiveConversation(conversation);
    setListOpen(false);
    setHistoryLoading(true);
    await loadHistory();
    setHistoryLoading(false);
  }

  async function handleCreateConversation() {
    const conversation = await createConversation();
    setActiveConversation(conversation);
    setListOpen(false);
  }

  return (
    <div className={styles.shell}>
      {desktop || listOpen ? (
        <ConversationList
          conversations={conversations}
          activeId={activeConversation?.id}
          loading={conversationsLoading}
          onSelect={handleSelectConversation}
          onCreate={handleCreateConversation}
        />
      ) : null}

      <div className="uf-flex uf-flex-column uf-h-full uf-min-w-0">
        <ChatHeader
          title={activeConversation?.titulo}
          onToggleList={!desktop ? () => setListOpen((prev) => !prev) : undefined}
        />

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className={cx(styles.scrollArea, 'uf-flex-1', 'uf-overflow-y-auto', 'uf-p-lg')}
        >
          {!activeConversation ? (
            <ChatEmptyState onStart={handleCreateConversation} />
          ) : historyLoading ? (
            <ChatLoading />
          ) : (
            <div className="uf-flex uf-flex-column uf-gap-lg">
              {messages.map((message) =>
                message.role === MESSAGE_ROLE.USER ? (
                  <UserMessage key={message.id} content={message.content} attachments={message.attachments} />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    content={message.content}
                    streaming={message.streaming}
                    attachments={message.attachments}
                  />
                )
              )}
            </div>
          )}

          <ScrollToBottom visible={showScrollButton} onClick={() => scrollToBottom('smooth')} />
        </div>

        <div className="uf-border-t uf-p-md">
          {error ? <ChatError message={error} onRetry={() => activeConversation && loadHistory()} /> : null}
          <ChatInput
            onSend={sendMessage}
            onUpload={uploadFile}
            disabled={sending || !activeConversation}
          />
        </div>
      </div>
    </div>
  );
}
