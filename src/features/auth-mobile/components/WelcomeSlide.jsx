import styles from '../authMobile.module.css';

function WelcomeVisual({ slideId, label }) {
  return (
    <div className={styles.welcomeVisual} data-visual={slideId} role="img" aria-label={label}>
      <div className={styles.visualHeader}>
        <span>Uni</span>
        <span className={styles.visualStatus}>Em foco</span>
      </div>
      <div className={styles.visualFocus}>
        <span className={styles.visualFocusLabel}>{label}</span>
        <strong>{slideId === 'conversation' ? 'Como posso ajudar?' : 'Seu próximo passo'}</strong>
      </div>
      <div className={styles.visualRows} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function WelcomeSlide({ slide, active }) {
  return (
    <article
      className={active ? styles.welcomeSlideActive : styles.welcomeSlide}
      aria-hidden={!active}
    >
      <WelcomeVisual slideId={slide.id} label={slide.visualLabel} />
      <div className={styles.welcomeCopy}>
        <h1>{slide.title}</h1>
        <p>{slide.description}</p>
      </div>
    </article>
  );
}

export default WelcomeSlide;
