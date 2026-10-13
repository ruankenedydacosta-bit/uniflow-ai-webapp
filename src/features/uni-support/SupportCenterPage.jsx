import { useEffect, useState } from 'react';
import { useAccess } from '../../app/AccessContext';
import { useSession } from '../../app/SessionContext';
import { AI_STATUS } from '../uni-llm';
import MessageBubble from '../uni-chat/components/MessageBubble';
import TypingIndicator from '../uni-chat/components/TypingIndicator';
import ErrorState from '../uni-chat/components/ErrorState';
import ChatInput from '../uni-chat/components/ChatInput';
import { useUniSupportChat } from './useUniSupportChat.js';
import { SUPPORT_FAQ_CATEGORIES, SUPPORT_SUGGESTED_QUESTIONS } from './supportFaq.js';
import SupportFaqAccordion from './components/SupportFaqAccordion.jsx';
import SupportRequestsList from './components/SupportRequestsList.jsx';
import SupportRequestFormModal from './SupportRequestFormModal.jsx';
import { listOwnSupportRequests } from './supportRequestService.js';
import styles from './SupportCenterPage.module.css';

export default function SupportCenterPage() {
  const { access } = useAccess();
  const { profile } = useSession();
  const workspaceId = access.currentWorkspaceId;
  const workspaceType = access.currentWorkspace;

  const chat = useUniSupportChat({ workspaceId, workspaceType });
  const [inputValue, setInputValue] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestFormPrefill, setRequestFormPrefill] = useState({ category: '', subject: '' });
  const [ownRequests, setOwnRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [lastCreatedRequest, setLastCreatedRequest] = useState(null);

  function ask(text) {
    if (!text || !text.trim()) return;
    chat.sendText(text);
    setInputValue('');
  }

  function handleSend(text) {
    ask(text);
  }

  function openRequestForm(prefill = { category: '', subject: '' }) {
    setRequestFormPrefill(prefill);
    setShowRequestForm(true);
  }

  function refreshOwnRequests() {
    setIsLoadingRequests(true);
    listOwnSupportRequests().then(({ data }) => {
      setOwnRequests(data ?? []);
      setIsLoadingRequests(false);
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (mount) das proprias solicitacoes, mesmo padrao ja usado no projeto
    refreshOwnRequests();
  }, []);

  function handleRequestCreated(request) {
    setShowRequestForm(false);
    setLastCreatedRequest(request);
    refreshOwnRequests();
  }

  const lastMessage = chat.messages[chat.messages.length - 1];
  const showEscalation = !chat.isTyping
    && lastMessage?.from === 'uni'
    && chat.aiStatus !== AI_STATUS.LOADING
    && (chat.lastKnowledge?.escalate === true || chat.aiStatus === AI_STATUS.ERROR);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Central de Suporte</h1>
        <p className={styles.subtitle}>
          A Uni pode te orientar sobre como usar a UniFlow AI. Para questões de conta, cobrança ou segurança,
          nossa equipe humana também está disponível.
        </p>
      </header>

      <section className={styles.askSection} aria-label="Pergunte à Uni">
        <h2 className={styles.askTitle}>Como a Uni pode ajudar?</h2>
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          disabled={chat.isTyping}
        />
        <div className={styles.suggestions} role="list">
          {SUPPORT_SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              role="listitem"
              className={styles.suggestionChip}
              onClick={() => ask(question)}
            >
              {question}
            </button>
          ))}
        </div>
      </section>

      {chat.messages.length > 0 && (
        <section className={styles.chatSection} aria-label="Conversa com a Uni">
          <div className={styles.chatMessages}>
            {chat.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
              />
            ))}
            {chat.isTyping && (
              <>
                <TypingIndicator />
                {chat.aiStatus === AI_STATUS.LOADING && (
                  <button type="button" className={styles.cancelButton} onClick={chat.cancel}>
                    Cancelar resposta
                  </button>
                )}
              </>
            )}
            {!chat.isTyping && chat.aiStatus === AI_STATUS.ERROR && (
              <ErrorState onRetry={chat.retry} />
            )}
            {!chat.isTyping && chat.aiStatus === AI_STATUS.CANCELLED && (
              <ErrorState variant="cancelled" />
            )}
          </div>
          {showEscalation && (
            <div className={styles.escalationBox} role="status">
              <p>Não consegui confirmar isso na base de conhecimento. Quer falar com nossa equipe?</p>
              <button
                type="button"
                className={styles.escalationButton}
                onClick={() => openRequestForm({ category: 'outro', subject: lastUnresolvedQuestion(chat) })}
              >
                Relatar para nossa equipe
              </button>
            </div>
          )}
        </section>
      )}

      <section className={styles.faqSection} aria-label="Perguntas frequentes">
        <h2 className={styles.sectionTitle}>Perguntas frequentes</h2>
        <SupportFaqAccordion categories={SUPPORT_FAQ_CATEGORIES} onAskUni={ask} />
      </section>

      <section className={styles.humanSection} aria-label="Atendimento humano">
        <h2 className={styles.sectionTitle}>Ainda precisa de ajuda?</h2>
        <p className={styles.humanCopy}>Relate o problema para nossa equipe. Respostas podem depender da versão atual do produto.</p>
        <button type="button" className={styles.humanButton} onClick={() => openRequestForm()}>
          Relatar um problema
        </button>
        {lastCreatedRequest && (
          <p className={styles.createdNote} role="status">
            Solicitação criada. Você pode acompanhar o status abaixo.
          </p>
        )}
        <h3 className={styles.subsectionTitle}>Minhas solicitações</h3>
        <SupportRequestsList requests={ownRequests} isLoading={isLoadingRequests} />
      </section>

      <SupportRequestFormModal
        open={showRequestForm}
        onClose={() => setShowRequestForm(false)}
        onCreated={handleRequestCreated}
        userId={profile?.id}
        workspaceId={workspaceId}
        conversationId={null}
        initialCategory={requestFormPrefill.category}
        initialSubject={requestFormPrefill.subject}
      />
    </div>
  );
}

function lastUnresolvedQuestion(chat) {
  const lastUser = [...chat.messages].reverse().find((m) => m.from === 'user');
  return lastUser?.text ? `Dúvida sobre: ${lastUser.text}`.slice(0, 150) : '';
}
