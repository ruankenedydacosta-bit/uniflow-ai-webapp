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
  lastUniMessage,
  voiceNotice,
  interimTranscript,
  voiceFeedback,
  voiceVolume,
  onDraftChange,
  onSubmit,
  onStartVoiceCapture,
  onSpeakLastResponse,
}) {
  return (
    <Card variant="default" padding="lg" className={styles.chatCard}>
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardTitle}>Conversa financeira</span>
          <p>Simulação visual da orientação da Uni com base no seu contexto.</p>
        </div>
        <div className={styles.chatActions}>
          <Badge variant={isListening ? 'success' : isSpeaking ? 'primary' : 'glass'}>
            {isListening ? 'Ouvindo...' : isSpeaking ? 'Falando...' : 'Mock'}
          </Badge>
          <Button variant="outline" size="sm" onClick={onStartVoiceCapture} aria-pressed={isListening}>
            {isListening ? 'Parar escuta' : 'Falar com a Uni'}
          </Button>
          <Button variant="outline" size="sm" onClick={onSpeakLastResponse} disabled={!lastUniMessage || isSpeaking}>
            {isSpeaking ? 'Falando...' : 'Ouvir resposta'}
          </Button>
        </div>
      </div>

      {voiceNotice ? (
        <p className={styles.voiceNotice} role="status" aria-live="polite">
          {voiceNotice}
        </p>
      ) : null}

      {isListening ? (
        <UniVoiceCapture
          interimTranscript={interimTranscript}
          voiceFeedback={voiceFeedback}
          voiceVolume={voiceVolume}
        />
      ) : null}

      <div className={styles.messages} aria-label="Mensagens simuladas">
        {messages.map((message) => (
          <UniMessageBubble key={message.id} message={message} />
        ))}
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
