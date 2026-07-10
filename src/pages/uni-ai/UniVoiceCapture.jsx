import styles from '../UniAIPage.module.css';

function UniVoiceCapture({
  isListening,
  isThinking,
  isSpeaking,
  isResponding,
  voiceFeedback,
  voiceVolume,
  onStartVoiceCapture,
}) {
  let stageStatus = 'Toque no microfone e fale naturalmente.';

  if (isListening) {
    stageStatus = 'Estou ouvindo... fale naturalmente.';
  } else if (isThinking) {
    stageStatus = 'Uni organizando seu contexto financeiro.';
  } else if (isResponding) {
    stageStatus = 'Orientação pronta.';
  } else if (isSpeaking) {
    stageStatus = 'Uni está falando a resposta.';
  }

  const stageLabel = isListening ? 'Ouvindo...' : 'Falar com a Uni';

  return (
    <section
      className={`${styles.voiceStage} ${isListening ? styles.voiceStageListening : ''} ${
        isThinking || isResponding ? styles.voiceStageProcessing : ''
      }`}
      aria-live="polite"
    >
      <div className={styles.voiceStageHeader}>
        <span>Uni Quick Capture</span>
        <strong>{stageStatus}</strong>
      </div>

      <button
        type="button"
        className={`${styles.voiceMicButton} ${isListening ? styles.voiceMicButtonActive : ''}`}
        onClick={onStartVoiceCapture}
        aria-pressed={isListening}
        aria-label={isListening ? 'Parar escuta da Uni' : 'Falar com a Uni'}
      >
        <span className={styles.microphonePulse} />
        <span className={styles.microphonePulse} />
        <span className={styles.microphone} aria-hidden="true">
          <span className={styles.microphoneHead} />
          <span className={styles.microphoneStem} />
        </span>
      </button>

      <span className={styles.voiceMicLabel}>{stageLabel}</span>

      <div
        className={`${styles.voiceWaves} ${styles[voiceFeedback.className]} ${
          isResponding ? styles.voiceWavesConfirmed : ''
        }`}
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div
        className={styles.voiceCapturePanel}
        role="meter"
        aria-label="Estado da captura de voz"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(voiceVolume * 100)}
      >
        <div className={styles.voiceCaptureCopy}>
          <strong>{isListening ? 'Uni está ouvindo' : 'Pronta para ouvir'}</strong>
          <span>{stageStatus}</span>
          <p>{voiceFeedback.message}</p>
        </div>
      </div>
    </section>
  );
}

export default UniVoiceCapture;
