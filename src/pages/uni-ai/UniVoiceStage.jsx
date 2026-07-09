import styles from '../UniAIPage.module.css';

function UniVoiceStage({
  experienceState,
  isListening,
  isSpeaking,
  isMuted,
  voiceVolume,
  onStartVoiceCapture,
}) {
  const isActive = isListening || isSpeaking;
  const volumeLevel = Math.max(0.18, Math.min(voiceVolume, 1));
  let mainStatus = 'Toque para falar.';
  let supportText = 'Fale naturalmente. A Uni organiza o contexto para você.';

  if (isListening) {
    mainStatus = 'Estou ouvindo...';
  } else if (isSpeaking) {
    mainStatus = 'A Uni está explicando sua análise...';
  }

  if (isMuted) {
    supportText = 'Áudio automático silenciado.';
  } else if (experienceState !== 'idle') {
    supportText = 'Tudo continua local e mockado nesta etapa.';
  }

  return (
    <section className={styles.premiumVoiceStage} aria-label="Palco de voz da Uni">
      <div className={styles.voiceIntro}>
        <span>Uni Quick Capture</span>
        <h2>Converse com a Uni</h2>
        <p>A clareza financeira começa com uma conversa.</p>
      </div>

      <button
        type="button"
        className={`${styles.heroMicButton} ${isActive ? styles.heroMicButtonActive : ''}`}
        onClick={onStartVoiceCapture}
        aria-pressed={isListening}
        aria-label={isListening ? 'Parar escuta da Uni' : 'Falar com a Uni'}
      >
        <span className={styles.heroMicAura} />
        <span className={styles.heroMicAura} />
        <span className={styles.heroMicIcon} aria-hidden="true">
          <span />
          <i />
        </span>
      </button>

      <div className={styles.voiceStageStatus} aria-live="polite">
        <strong>{mainStatus}</strong>
        <span>{supportText}</span>
      </div>

      <div className={styles.stageWave} aria-hidden="true">
        {[0.35, 0.52, 0.74, 1, 0.76, 0.54, 0.36].map((ratio, index) => (
          <span
            key={ratio}
            style={{
              '--voice-level': `${Math.max(0.22, volumeLevel * ratio)}`,
              '--voice-delay': `${index * 90}ms`,
            }}
          />
        ))}
      </div>
    </section>
  );
}

export default UniVoiceStage;
