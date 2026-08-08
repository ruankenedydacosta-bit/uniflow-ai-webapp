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
// - TTS/voz existentes (useUniVoiceTts/useVoicePreference) com autoplay
//   apenas para resposta nova e botões Ouvir/Pausar/Parar no card;
// - visual 100% dentro do shell/scroll único do Lote F (classes do
//   simplifiedApp.module.css: .compactResponse/.transcript/.uniResponse),
//   tokens --uf-* escuros já garantidos pela .shell.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccess } from '../../app/AccessContext';
import { useUniSupportChat } from '../uni-support/useUniSupportChat.js';
import { SUPPORT_SUGGESTED_QUESTIONS } from '../uni-support/supportFaq.js';
import ChatInput from '../uni-chat/components/ChatInput.jsx';
import SafeMarkdown from '../../components/content/SafeMarkdown.jsx';
import {
  useUniVoiceTts,
  useVoicePreference,
  VOICE_TTS_STATUS,
} from '../uni-voice-tts/index.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
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
  const navigate = useNavigate();
  const { access } = useAccess();
  const workspaceId = access.currentWorkspaceId;
  const workspaceType = access.currentWorkspace;

  const chat = useUniSupportChat({ workspaceId, workspaceType });
  const uniVoice = useUniVoiceTts();
  const voicePreference = useVoicePreference();
  const [voiceMessageId, setVoiceMessageId] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const lastSpokenIdRef = useRef(null);

  useEffect(() => () => uniVoice.stop(), [uniVoice]);

  const lastUser = useMemo(
    () => [...chat.messages].reverse().find((message) => message.from === 'user') ?? null,
    [chat.messages],
  );
  const lastUni = useMemo(
    () => [...chat.messages].reverse().find((message) => message.from === 'uni') ?? null,
    [chat.messages],
  );

  const handleSpeakMessage = useCallback((message) => {
    if (!message?.text) return;
    uniVoice.stop();
    setVoiceMessageId(message.id);
    void uniVoice.speak(message.text);
  }, [uniVoice]);

  const handlePauseResumeVoice = useCallback(() => {
    if (uniVoice.status === VOICE_TTS_STATUS.PLAYING) uniVoice.pause();
    else if (uniVoice.status === VOICE_TTS_STATUS.PAUSED) uniVoice.resume();
  }, [uniVoice]);

  const handleStopVoice = useCallback(() => uniVoice.stop(), [uniVoice]);

  // LOTE E -- autoplay de UMA resposta por vez (mesmo contrato da Home):
  // só narra quando uma mensagem NOVA da Uni aparece (registro por id),
  // nunca histórico/remount; interrompe TTS anterior antes de falar.
  useEffect(() => {
    if (!voicePreference.enabled || chat.isTyping) return;
    if (!lastUni?.text) return;
    if (voiceMessageId === lastUni.id || lastSpokenIdRef.current === lastUni.id) return;
    lastSpokenIdRef.current = lastUni.id;
    handleSpeakMessage(lastUni);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUni?.id, lastUni?.text, chat.isTyping, voicePreference.enabled]);

  function ask(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed || chat.isTyping) return;
    uniVoice.stop();
    setVoiceMessageId(null);
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
  const activeVoice = voiceMessageId === lastUni?.id ? uniVoice.status : VOICE_TTS_STATUS.IDLE;
  const isVoicePlaying = activeVoice === VOICE_TTS_STATUS.PLAYING;
  const isVoicePaused = activeVoice === VOICE_TTS_STATUS.PAUSED;

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
          {showResponse && voicePreference.enabled && (
            <div className={pageStyles.voiceRow}>
              <button
                type="button"
                className={pageStyles.voiceButton}
                onClick={() => {
                  if (isVoicePlaying || isVoicePaused) handlePauseResumeVoice();
                  else if (lastUni?.text) handleSpeakMessage(lastUni);
                }}
                disabled={activeVoice === VOICE_TTS_STATUS.LOADING}
                aria-pressed={isVoicePlaying || isVoicePaused}
                aria-label={isVoicePlaying ? 'Pausar leitura da resposta' : isVoicePaused ? 'Retomar leitura da resposta' : 'Ouvir resposta da Uni'}
              >
                <span className={pageStyles.voiceButtonLabel}>
                  {isVoicePlaying ? 'Pausar' : isVoicePaused ? 'Retomar' : activeVoice === VOICE_TTS_STATUS.ERROR ? 'Ouvir novamente' : 'Ouvir resposta'}
                </span>
              </button>
              {isVoicePlaying || isVoicePaused ? (
                <button type="button" className={pageStyles.voiceStop} onClick={handleStopVoice}>
                  Parar
                </button>
              ) : null}
              {activeVoice === VOICE_TTS_STATUS.ERROR ? (
                <span className={pageStyles.voiceError} role="status">
                  Não foi possível reproduzir esta resposta.
                </span>
              ) : null}
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
          onBeforeVoiceStart={handleStopVoice}
          disabled={chat.isTyping}
          isSpeaking={isVoicePlaying || isVoicePaused || activeVoice === VOICE_TTS_STATUS.LOADING}
          onInterruptSpeech={handleStopVoice}
        />
      </div>
    </div>
  );
}