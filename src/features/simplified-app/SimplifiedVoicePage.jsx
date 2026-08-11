import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import {
  CONVERSATION_STYLES,
  resolveConversationStyle,
} from '../uni-llm/conversationStyle.js';
import {
  VOICE_PROVIDER_OPTIONS,
  isValidVoiceProvider,
  resolveVoiceProvider,
} from '../uni-voice-tts/voiceProviderRegistry.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedVoice.module.css';

const STYLE_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'simple',
    title: 'Simples',
    description: 'Respostas curtas e diretas, ideais para interações rápidas por voz.',
    recommendation: 'Padrão recomendado',
  }),
  Object.freeze({
    id: 'normal',
    title: 'Normal',
    description: 'Contexto moderado e explicações equilibradas.',
  }),
  Object.freeze({
    id: 'detailed',
    title: 'Detalhado',
    description: 'Respostas mais completas e análises aprofundadas dentro dos limites da Uni.',
  }),
]);

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function SimplifiedVoicePage() {
  const navigate = useNavigate();
  const { profile, updateVoicePreferences } = useSession();
  const activeStyle = resolveConversationStyle(profile?.conversation_style);
  const activeVoiceProvider = resolveVoiceProvider(profile?.voice_provider);
  const [selectedStyle, setSelectedStyle] = useState(activeStyle);
  const [selectedVoiceProvider, setSelectedVoiceProvider] = useState(activeVoiceProvider);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const hasChanges = selectedStyle !== activeStyle
    || selectedVoiceProvider !== activeVoiceProvider;

  function handleSelect(style) {
    if (!CONVERSATION_STYLES.includes(style) || isSaving) return;
    setSelectedStyle(style);
    setFeedback(null);
  }

  function handleVoiceProviderSelect(providerId) {
    if (!isValidVoiceProvider(providerId) || isSaving) return;
    setSelectedVoiceProvider(providerId);
    setFeedback(null);
  }

  async function handleSave() {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    setFeedback(null);

    const result = await updateVoicePreferences({
      conversationStyle: selectedStyle,
      voiceProvider: selectedVoiceProvider,
    });
    setIsSaving(false);

    if (result.error) {
      setFeedback({
        type: 'error',
        message: result.error.code === 'CONVERSATION_STYLE_UNAVAILABLE'
          ? 'Esta configuração ainda não está disponível neste ambiente.'
          : 'Não foi possível salvar agora. Sua preferência anterior foi mantida.',
      });
      return;
    }

    setFeedback({
      type: 'success',
      message: 'Preferências salvas. A Uni já usará esta voz nas próximas respostas.',
    });
  }

  return (
    <div className={styles.page} data-simplified-voice>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
          aria-label="Voltar para Conta"
        >
          <BackIcon />
        </button>
        <div>
          <h1>Voz da Uni</h1>
          <p>Escolha como a Uni deve desenvolver as respostas.</p>
        </div>
      </header>

      <fieldset className={styles.options} disabled={isSaving}>
        <legend>Estilo de voz</legend>
        {VOICE_PROVIDER_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={styles.option}
            data-selected={selectedVoiceProvider === option.id}
          >
            <input
              type="radio"
              name="voice-provider"
              value={option.id}
              checked={selectedVoiceProvider === option.id}
              onChange={() => handleVoiceProviderSelect(option.id)}
            />
            <span className={styles.optionCopy}>
              <span className={styles.optionTitle}>
                <strong>{option.title}</strong>
                <small data-tier={option.id}>{option.badge}</small>
              </span>
              <span>{option.description}</span>
            </span>
            <span className={styles.radioMark} aria-hidden="true" />
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.options} disabled={isSaving}>
        <legend>Estilo de conversa</legend>
        {STYLE_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={styles.option}
            data-selected={selectedStyle === option.id}
          >
            <input
              type="radio"
              name="conversation-style"
              value={option.id}
              checked={selectedStyle === option.id}
              onChange={() => handleSelect(option.id)}
            />
            <span className={styles.optionCopy}>
              <span className={styles.optionTitle}>
                <strong>{option.title}</strong>
                {option.recommendation ? <small>{option.recommendation}</small> : null}
              </span>
              <span>{option.description}</span>
            </span>
            <span className={styles.radioMark} aria-hidden="true" />
          </label>
        ))}
      </fieldset>

      {feedback ? (
        <p
          className={feedback.type === 'error' ? styles.error : styles.success}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}

      <button
        type="button"
        className={styles.saveButton}
        disabled={!hasChanges || isSaving}
        onClick={handleSave}
      >
        {isSaving ? 'Salvando…' : 'Salvar preferência'}
      </button>
    </div>
  );
}

export default SimplifiedVoicePage;
