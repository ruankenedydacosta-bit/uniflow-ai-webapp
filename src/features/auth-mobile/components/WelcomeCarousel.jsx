import { useRef, useState } from 'react';
import Button from '../../../components/ui/Button';
import { WELCOME_SLIDES, getNextSlideIndex } from '../authMobileSchema.js';
import WelcomeSlide from './WelcomeSlide.jsx';
import styles from '../authMobile.module.css';

function WelcomeCarousel({ onCreateAccount, onSignIn }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartRef = useRef(null);
  const isLast = activeIndex === WELCOME_SLIDES.length - 1;

  function move(direction) {
    setActiveIndex((current) => getNextSlideIndex(current, direction));
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    const end = event.changedTouches?.[0]?.clientX;
    touchStartRef.current = null;
    if (!Number.isFinite(start) || !Number.isFinite(end) || Math.abs(start - end) < 40) return;
    move(start > end ? 1 : -1);
  }

  return (
    <section className={styles.carousel} aria-roledescription="carrossel" aria-label="Conheça a UniFlow AI">
      <div
        className={styles.slideViewport}
        onTouchStart={(event) => { touchStartRef.current = event.touches?.[0]?.clientX; }}
        onTouchEnd={handleTouchEnd}
      >
        {WELCOME_SLIDES.map((slide, index) => (
          <WelcomeSlide key={slide.id} slide={slide} active={index === activeIndex} />
        ))}
      </div>

      <div className={styles.carouselControls}>
        <button
          type="button"
          className={styles.carouselArrow}
          disabled={activeIndex === 0}
          aria-label="Página anterior"
          onClick={() => move(-1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className={styles.pageIndicators} aria-label={`Página ${activeIndex + 1} de ${WELCOME_SLIDES.length}`}>
          {WELCOME_SLIDES.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              className={index === activeIndex ? styles.pageIndicatorActive : styles.pageIndicator}
              aria-label={`Ir para página ${index + 1}`}
              aria-current={index === activeIndex ? 'step' : undefined}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
        <button
          type="button"
          className={styles.carouselArrow}
          disabled={isLast}
          aria-label="Próxima página"
          onClick={() => move(1)}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className={styles.welcomeActions}>
        <Button size="xl" fullWidth onClick={isLast ? onCreateAccount : () => move(1)}>
          {isLast ? 'Criar minha conta' : 'Continuar'}
        </Button>
        <button type="button" className={styles.secondaryLink} onClick={onSignIn}>
          Já tenho uma conta
        </button>
      </div>
    </section>
  );
}

export default WelcomeCarousel;
