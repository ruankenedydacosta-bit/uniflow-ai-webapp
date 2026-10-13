// LOTE E -- Uni Suporte dedicada: experiência compacta no shell escuro da
// experiência simplificada, com identidade própria ("Uni Suporte") e o
// MESMO contrato de suporte existente por trás:
//
// - `useUniSupportChat`: conversation_type='support' + generateSupportResponse
//   (orquestrador/prompt de suporte já existentes; nunca o chat financeiro);
// - UMA única resposta ativa por vez (sem empilhamento): o card compacto
//   mostra apenas a última pergunta e a última resposta do turno atual;
// - próximas sugestões aparecem ABAIXO da resposta (SUPPORT_SUGGESTED_QUESTIONS,
//   mesma fonte da Central de Suporte);
// - visual 100% dentro do shell/scroll único do Lote F (classes do
//   simplifiedApp.module.css: .compactResponse/.transcript/.uniResponse),
//   tokens --uf-* escuros já garantidos pela .shell.
import { useMemo, useState } from 'react';
import { useAccess } from '../../app/AccessContext';
import { useUniSupportChat } from '../uni-support/useUniSupportChat.js';
import { SUPPORT_SUGGESTED_QUESTIONS } from '../uni-support/supportFaq.js';
import ChatInput from '../uni-chat/components/ChatInput.jsx';
import SafeMarkdown from '../../components/content/SafeMarkdown.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useNavegar } from './movimentoDeTelaContext.js';
import styles from './simplifiedApp.module.css';
import pageStyles from './simplifiedUniSupport.module.css';

const SUPPORT_IDENTITY = Object.freeze({
  eyebrow: 'Atendimento dedicado',
  title: 'Uni Suporte',
  subtitle:
    'Pergunte sobre como usar o aplicativo, encontrar recursos ou entender a UniFlow AI.',
});

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function ErrorInline({ onRetry, variant }) {
  return (
    <div className={pageStyles.errorInline} role={variant === 'error' ? 'alert' : 'status'}>
      <span>
        {variant === 'cancelled'
          ? 'Resposta cancelada. Você pode tentar novamente quando quiser.'
          : 'Não consegui responder agora. Tente novamente.'}
      </span>
      {variant === 'error' ? (
        <button type="button" className={pageStyles.errorRetry} onClick={onRetry}>
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}

export default function SimplifiedUniSupportPage() {
  const navigate = useNavegar();
  const { access } = useAccess();
  const workspaceId = access.currentWorkspaceId;
  const workspaceType = access.currentWorkspace;

  const chat = useUniSupportChat({ workspaceId, workspaceType });
  const [inputValue, setInputValue] = useState('');

  const lastUser = useMemo(
    () => [...chat.messages].reverse().find((message) => message.from === 'user') ?? null,
    [chat.messages],
  );
  const lastUni = useMemo(
    () => [...chat.messages].reverse().find((message) => message.from === 'uni') ?? null,
    [chat.messages],
  );

  function ask(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed || chat.isTyping) return;
    chat.sendText(trimmed);
    setInputValue('');
  }

  function handleSend(text) {
    ask(text);
  }

  const isProcessing = chat.isTyping || chat.aiStatus === 'loading';
  const showResponse = Boolean(lastUni?.text) && !isProcessing;
  const showError = !chat.isTyping && chat.aiStatus === 'error';
  const showCancelled = !chat.isTyping && chat.aiStatus === 'cancelled';

  return (
    <div className={pageStyles.page} data-simplified-uni-support>
      <header className={pageStyles.header}>
        <button
          type="button"
          className={pageStyles.backButton}
          onClick={() => navigate(SIMPLIFIED_ROUTES.SUPPORT)}
          aria-label="Voltar para Suporte"
        >
          <BackIcon />
        </button>
        <div className={pageStyles.headerText}>
          <span className={pageStyles.eyebrow}>{SUPPORT_IDENTITY.eyebrow}</span>
          <h1>{SUPPORT_IDENTITY.title}</h1>
        </div>
      </header>

      {chat.messages.length === 0 ? (
        <section className={pageStyles.hero}>
          <div className={pageStyles.mascot} aria-hidden="true">
            <span className={pageStyles.mascotFace}>🙂</span>
          </div>
          <p className={pageStyles.heroSubtitle}>{SUPPORT_IDENTITY.subtitle}</p>
          <div className={pageStyles.suggestions} role="list" aria-label="Perguntas sugeridas">
            {SUPPORT_SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                role="listitem"
                className={pageStyles.suggestionChip}
                onClick={() => ask(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className={styles.compactResponse} aria-label="Resposta da Uni Suporte" aria-live="polite">
          {lastUser?.text ? (
            <p className={styles.transcript}><span>Você</span>{lastUser.text}</p>
          ) : null}
          {isProcessing ? (
            <p className={styles.uniProcessing} role="status">
              <span className={styles.uniProcessingDot} aria-hidden="true" />
              {chat.aiStatus === 'loading' ? 'Buscando a resposta certa para você…' : 'Entendendo seu pedido…'}
            </p>
          ) : null}
          {showError && (
            <ErrorInline onRetry={chat.retry} variant="error" />
          )}
          {showCancelled && (
            <ErrorInline onRetry={chat.retry} variant="cancelled" />
          )}
          {showResponse && (
            <div className={styles.uniResponse}>
              <span>Uni Suporte</span>
              <SafeMarkdown className={pageStyles.responseText}>{lastUni.text}</SafeMarkdown>
            </div>
          )}
          <div className={pageStyles.nextSuggestions} aria-label="Próximas sugestões">
            <span className={pageStyles.nextLabel}>Pode perguntar também</span>
            {SUPPORT_SUGGESTED_QUESTIONS.slice(0, 3).map((question) => (
              <button
                key={question}
                type="button"
                className={pageStyles.nextChip}
                onClick={() => ask(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={pageStyles.inputRow}>
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          disabled={chat.isTyping}
        />
      </div>
    </div>
  );
}