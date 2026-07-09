import styles from '../UniAIPage.module.css';

function UniVoiceCapture({ interimTranscript, voiceFeedback, voiceVolume }) {
  return (
    <div className={styles.voiceCapturePanel} aria-live="polite">
      <div className={styles.microphone} aria-hidden="true">
        <span className={styles.microphoneHead} />
        <span className={styles.microphoneStem} />
      </div>
      <div className={styles.voiceCaptureCopy}>
        <strong>Uni está ouvindo</strong>
        <span>{interimTranscript ? `Ouvindo: ${interimTranscript}` : 'Estou ouvindo... fale naturalmente.'}</span>
        <p>{voiceFeedback.message}</p>
      </div>
      <div
        className={`${styles.voiceWaves} ${styles[voiceFeedback.className]}`}
        role="meter"
        aria-label="Intensidade do áudio"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(voiceVolume * 100)}
      >
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default UniVoiceCapture;
