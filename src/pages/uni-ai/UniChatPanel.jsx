import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import styles from '../UniAIPage.module.css';
import UniMessageBubble from './UniMessageBubble';
import UniVoiceCapture from './UniVoiceCapture';

function UniChatPanel({
  messages,
  draftMessage,
  canSendMessage,
  isListening,
  isSpeaking,
  isThinking,
  isResponding,
  lastUniMessage,
  voiceNotice,
  interimTranscript,
  confirmedTranscript,
  thinkingStep,
  thinkingSteps,
  thinkingStepIndex,
  voiceFeedback,
  voiceVolume,
  onDraftChange,
  onSubmit,
  onStartVoiceCapture,
  onAudioControl,
}) {
  const hasFeaturedResponse = Boolean(lastUniMessage);
  const historyMessages = hasFeaturedResponse
    ? messages.filter((message) => message.id !== lastUniMessage.id).slice(-4)
    : messages.slice(-4);

  function getThinkingStepClass(index) {
    if (index === thinkingStepIndex) return styles.thinkingStepActive;
    if (index < thinkingStepIndex) return styles.thinkingStepDone;
    return undefined;
  }

  return (
    <Card variant="default" padding="lg" className={styles.chatCard}>
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardTitle}>Experiência de voz financeira</span>
          <p>Fale com a Uni para transformar contexto financeiro em uma orientação clara.</p>
        </div>
        <div className={styles.chatActions}>
          <Badge variant={isListening ? 'success' : isSpeaking || isThinking ? 'primary' : 'glass'}>
            {isListening ? 'Ouvindo...' : isSpeaking ? 'Falando...' : isThinking ? 'Analisando...' : 'Pronta'}
          </Badge>
          <Button variant="outline" size="sm" onClick={onAudioControl} disabled={!lastUniMessage || isThinking}>
            {isSpeaking ? 'Parar áudio' : 'Repetir áudio'}
          </Button>
        </div>
      </div>

      {voiceNotice ? (
        <p className={styles.voiceNotice} role="status" aria-live="polite">
          {voiceNotice}
        </p>
      ) : null}

      <UniVoiceCapture
        isListening={isListening}
        isThinking={isThinking}
        isSpeaking={isSpeaking}
        isResponding={isResponding}
        interimTranscript={interimTranscript}
        confirmedTranscript={confirmedTranscript}
        voiceFeedback={voiceFeedback}
        voiceVolume={voiceVolume}
        onStartVoiceCapture={onStartVoiceCapture}
      />

      <div className={styles.voiceExperienceFlow}>
        {isThinking ? (
          <div className={styles.thinkingPanel} role="status" aria-live="polite">
            <span className={styles.thinkingDot} aria-hidden="true" />
            <div className={styles.thinkingSteps}>
              <strong>Uni analisando</strong>
              {thinkingSteps.map((step, index) => (
                <span key={step} className={getThinkingStepClass(index)}>
                  {index === thinkingStepIndex ? thinkingStep : step}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {hasFeaturedResponse && !isThinking ? (
          <article
            className={`${styles.uniResponseCard} ${isResponding ? styles.uniResponseCardActive : ''}`}
            aria-live="polite"
          >
            <div className={styles.uniResponseHeader}>
              <span className={styles.uniResponseAvatar}>U</span>
              <span>Uni · consultora financeira</span>
            </div>
            <p>{lastUniMessage.content}</p>
          </article>
        ) : null}
      </div>

      <div className={styles.historyPanel} aria-label="Histórico recente da conversa">
        <span className={styles.historyTitle}>Histórico recente</span>
        <div className={styles.messages}>
          {historyMessages.map((message) => (
            <UniMessageBubble key={message.id} message={message} />
          ))}
        </div>
      </div>

      <form className={styles.composer} aria-label="Enviar mensagem para a Uni" onSubmit={onSubmit}>
        <Input
          fullWidth
          variant="glass"
          placeholder="Pergunte algo para a Uni..."
          aria-label="Pergunte algo para a Uni"
          value={draftMessage}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <Button type="submit" disabled={!canSendMessage}>
          Enviar
        </Button>
      </form>
    </Card>
  );
}

export default UniChatPanel;
