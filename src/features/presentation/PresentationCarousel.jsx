import { useRef, useState } from 'react';
import OutlineButton from '../../components/ui/OutlineButton/OutlineButton.jsx';
import { PhArrowLeftIcon, UniMark } from '../simplified-app/SimplifiedIcons.jsx';
import PresentationArtwork from './PresentationArtwork.jsx';
import { PRESENTATION_SLIDES } from './presentationConfig.js';
import {
  getAdjacentPresentationIndex,
  getSwipeDirection,
} from './presentationNavigation.js';
import styles from './Presentation.module.css';

// Tela 21a–c: topo com a marca e "Pular", arte no espaço livre e, na base,
// título, texto, voltar com os pontos, o botão principal e a parceria.
function PresentationCarousel({ onComplete }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStartRef = useRef(null);
  const completingRef = useRef(false);
  const activeSlide = PRESENTATION_SLIDES[activeIndex];
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === PRESENTATION_SLIDES.length - 1;

  function move(direction) {
    setActiveIndex((current) => getAdjacentPresentationIndex(current, direction));
  }

  function completePresentation() {
    if (completingRef.current) return;
    completingRef.current = true;
    onComplete();
  }

  function handlePrimaryAction() {
    if (isLast) {
      completePresentation();
      return;
    }
    move(1);
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStartRef.current = event.clientX;
  }

  function handlePointerUp(event) {
    const direction = getSwipeDirection(pointerStartRef.current, event.clientX);
    pointerStartRef.current = null;
    if (direction) move(direction);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    }
  }

  return (
    <section
      className={styles.carousel}
      aria-roledescription="carrossel"
      aria-label="Apresentação inicial da UniFlow AI"
      tabIndex="0"
      onKeyDown={handleKeyDown}
    >
      <header className={styles.topBar}>
        <span className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true"><UniMark /></span>
          <span>UniFlow AI</span>
        </span>
        {activeSlide.skipAction ? (
          <OutlineButton variant="ghost" className={styles.skipAction} onClick={completePresentation}>
            {activeSlide.skipAction}
          </OutlineButton>
        ) : null}
      </header>

      <div
        className={styles.slideViewport}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStartRef.current = null; }}
      >
        <article
          key={activeSlide.id}
          className={styles.slide}
          aria-labelledby={`presentation-title-${activeSlide.id}`}
        >
          <div className={styles.illustrationArea}>
            <PresentationArtwork type={activeSlide.artwork} />
          </div>

          <div className={styles.slideCopy}>
            <h1 id={`presentation-title-${activeSlide.id}`}>{activeSlide.title}</h1>
            <p>{activeSlide.description}</p>
          </div>
        </article>
      </div>

      <div className={styles.actions}>
        <div className={styles.navigationRow}>
          {isFirst ? null : (
            <button
              type="button"
              className={styles.backAction}
              aria-label="Voltar ao slide anterior"
              onClick={() => move(-1)}
            >
              <PhArrowLeftIcon />
            </button>
          )}

          <div
            className={styles.progressDots}
            role="group"
            aria-label={`Slide ${activeIndex + 1} de ${PRESENTATION_SLIDES.length}`}
          >
            {PRESENTATION_SLIDES.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={styles.progressDot}
                aria-label={`Ir para o slide ${index + 1}`}
                aria-current={index === activeIndex ? 'step' : undefined}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        </div>

        <OutlineButton className={styles.primaryAction} onClick={handlePrimaryAction}>
          {activeSlide.primaryAction}
        </OutlineButton>

        <p className={styles.partnershipNote}>Em parceria com a SmartTech</p>
      </div>

      <p className={styles.liveRegion} aria-live="polite">
        Slide {activeIndex + 1} de {PRESENTATION_SLIDES.length}: {activeSlide.title}
      </p>
    </section>
  );
}

export default PresentationCarousel;
