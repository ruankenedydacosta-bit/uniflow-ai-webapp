import styles from '../UniAIPage.module.css';

function UniTranscriptPanel({ interimTranscript, confirmedTranscript, transcriptFallback, isListening }) {
  const text = confirmedTranscript || interimTranscript || transcriptFallback;

  if (!text && !isListening) return null;

  return (
    <section className={styles.transcriptPanel} aria-live="polite">
      <span>Fala reconhecida</span>
      <p>
        {text
          ? text.split(' ').map((word, index) => (
              <strong key={`${word}-${index}`} style={{ '--word-delay': `${index * 48}ms` }}>
                {word}
              </strong>
            ))
          : 'Estou ouvindo...'}
      </p>
    </section>
  );
}

export default UniTranscriptPanel;
