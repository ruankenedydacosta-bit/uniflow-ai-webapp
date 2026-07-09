import styles from '../UniAIPage.module.css';

function UniThinkingSequence({ active, steps, activeIndex }) {
  if (!active) return null;

  function getStepClass(index) {
    if (index === activeIndex) return styles.reasoningStepActive;
    if (index < activeIndex) return styles.reasoningStepDone;
    return undefined;
  }

  return (
    <section className={styles.reasoningPanel} role="status" aria-live="polite">
      <div className={styles.reasoningPulse} aria-hidden="true" />
      <div className={styles.reasoningCopy}>
        <span>A Uni está pensando</span>
        <strong>{steps[activeIndex]}</strong>
      </div>
      <div className={styles.reasoningSteps}>
        {steps.map((step, index) => (
          <span key={step} className={getStepClass(index)}>
            {step}
          </span>
        ))}
      </div>
    </section>
  );
}

export default UniThinkingSequence;
