import styles from '../UniAIPage.module.css';

function UniTranscriptPanel({ interimTranscript, confirmedTranscript, isListening }) {
  const text = confirmedTranscript || interimTranscript;

  if (!text && !isListening) return null;

  return (
    <section className={styles.transcriptPanel} aria-live="polite">
      <span>{confirmedTranscript ? 'Fala reconhecida' : 'Transcrição em tempo real'}</span>
      <p>
        {text
          ? text.split(' ').map((word, index) => (
              <strong key={`${word}-${index}`} style={{ '--word-delay': `${index * 48}ms` }}>
                {word}
              </strong>
            ))
          : 'Estou ouvindo... pode falar naturalmente.'}
      </p>
    </section>
  );
}

export default UniTranscriptPanel;
