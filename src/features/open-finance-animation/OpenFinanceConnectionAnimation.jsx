import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './OpenFinanceConnectionAnimation.module.css';
import FinancialInstitutionNode from './FinancialInstitutionNode.jsx';
import SecureConnectionCore from './SecureConnectionCore.jsx';
import DataPulse from './DataPulse.jsx';
import OrganizedDataPreview from './OrganizedDataPreview.jsx';
import UniProcessingSteps from './UniProcessingSteps.jsx';
import { ANIMATION_STEPS, MOCK_INSTITUTIONS, getTimedSteps } from './openFinanceAnimationSteps.js';

const STEP_COUNT = ANIMATION_STEPS.length;

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/**
 * OpenFinanceConnectionAnimation
 *
 * Illustrative, non-functional preview of how UniFlow will connect Open
 * Finance accounts once the feature ships. No real network calls, no OAuth,
 * no credential capture — every value here is mocked.
 *
 * Props:
 *  - variant: 'compact' | 'expanded'          (default 'compact')
 *  - theme: 'light' | 'dark' | 'uniflow' | 'system'  (default 'system')
 *  - autoPlay: boolean                        (default true)
 *  - loop: boolean                            (default true for compact, false for expanded)
 *  - activeStep: number | undefined           (controlled step index, optional)
 *  - onStepChange: (index: number) => void
 *  - onLearnMore: () => void                  (compact: "Ver mais" tap target)
 *  - onComplete: () => void                   (expanded: fired once by "Entendi")
 */
export default function OpenFinanceConnectionAnimation({
  variant = 'compact',
  theme = 'system',
  autoPlay = true,
  loop,
  activeStep,
  onStepChange,
  onLearnMore,
  onComplete,
}) {
  const resolvedLoop = loop ?? variant === 'compact';
  const reducedMotion = useReducedMotion();
  const timedSteps = useMemo(() => getTimedSteps(variant), [variant]);

  const isControlled = Number.isFinite(activeStep);
  const [internalStep, setInternalStep] = useState(0);
  const requestedStep = isControlled ? Math.trunc(activeStep) : internalStep;
  const currentStep = Math.max(0, Math.min(STEP_COUNT - 1, requestedStep));

  const [playing, setPlaying] = useState(autoPlay && !reducedMotion);
  const [isInViewport, setIsInViewport] = useState(true);
  const timeoutRef = useRef(null);
  const completedRef = useRef(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver !== 'function') return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      setIsInViewport(entry.isIntersecting);
    }, { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const goToStep = useCallback(
    (next) => {
      const clamped = Math.max(0, Math.min(STEP_COUNT - 1, next));
      if (!isControlled) setInternalStep(clamped);
      onStepChange?.(clamped);
    },
    [isControlled, onStepChange]
  );

  const advance = useCallback(() => {
    const isLast = currentStep === STEP_COUNT - 1;
    if (isLast) {
      if (resolvedLoop) {
        goToStep(0);
      } else {
        setPlaying(false);
      }
      return;
    }
    goToStep(currentStep + 1);
  }, [currentStep, resolvedLoop, goToStep]);

  // Reduced motion keeps the educational state static instead of advancing a timeline.
  useEffect(() => {
    if (!playing || !isInViewport || reducedMotion) return undefined;
    const step = timedSteps[currentStep];
    timeoutRef.current = setTimeout(advance, step.durationMs);
    return () => clearTimeout(timeoutRef.current);
  }, [playing, isInViewport, reducedMotion, currentStep, timedSteps, advance]);

  const handlePlayPause = () => setPlaying((p) => !p);
  const handleRestart = () => {
    completedRef.current = false;
    goToStep(0);
    setPlaying(true);
  };
  const handleNext = () => {
    completedRef.current = false;
    if (currentStep === STEP_COUNT - 1) {
      goToStep(0);
    } else {
      goToStep(currentStep + 1);
    }
  };
  const handleComplete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  };

  // Keyboard navigation (expanded variant only)
  const handleKeyDown = (e) => {
    if (variant !== 'expanded') return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      handlePlayPause();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    } else if (e.key === 'ArrowLeft') {
      goToStep(currentStep - 1);
    } else if (e.key === 'Home') {
      handleRestart();
    }
  };

  const step = ANIMATION_STEPS[currentStep];

  return (
    <div
      ref={containerRef}
      className={styles.root}
      data-theme={theme}
      data-in-viewport={isInViewport}
      role="group"
      aria-roledescription="animação"
      aria-label="Animação: como a conexão Open Finance da UniFlow vai funcionar"
      tabIndex={variant === 'expanded' ? 0 : -1}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.srOnly}>
        Prévia ilustrativa e ainda não disponível de como a UniFlow vai conectar suas contas: suas
        contas hoje estão espalhadas em instituições diferentes; você autoriza a conexão com
        segurança, sem informar senha; os dados de saldo, transações, contas e cartões chegam
        automaticamente; a UniFlow organiza tudo em receitas, despesas, contas, cartões e
        categorias; a Uni analisa esses dados e transforma em orientações; o resultado é menos
        trabalho manual e mais clareza para decidir. Funcionalidade em breve.
      </span>

      <div className={styles.stage} data-variant={variant}>
        <div className={styles.captionRow}>
          <p className={styles.caption} aria-live="polite">
            {step.text}
          </p>
          <span className={styles.badge}>Em breve</span>
        </div>

        <div className={styles.canvas} aria-hidden="true">
          {ANIMATION_STEPS.map((s, i) => (
            <div key={s.id} className={styles.stepLayer} data-active={i === currentStep}>
              <StepVisual stepId={s.id} active={i === currentStep} reducedMotion={reducedMotion} />
            </div>
          ))}
        </div>

        {variant === 'compact' && onLearnMore && (
          <button type="button" className={styles.learnMoreLink} onClick={onLearnMore}>
            Ver mais →
          </button>
        )}

        {variant === 'expanded' && (
          <div className={styles.controlsRow}>
            <div className={styles.stepIndicator} aria-hidden="true">
              {ANIMATION_STEPS.map((s, i) => (
                <span key={s.id} className={styles.stepDot} data-active={i === currentStep} />
              ))}
            </div>
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.controlButton}
                onClick={handleRestart}
                aria-label="Reiniciar animação"
                title="Reiniciar"
              >
                ⟲
              </button>
              <button
                type="button"
                className={styles.controlButton}
                onClick={handlePlayPause}
                aria-label={playing ? 'Pausar animação' : 'Reproduzir animação'}
                title={playing ? 'Pausar' : 'Reproduzir'}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <button
                type="button"
                className={styles.controlButton}
                onClick={handleNext}
                aria-label="Avançar etapa"
                title="Avançar"
              >
                ⏭
              </button>
              {currentStep === STEP_COUNT - 1 && (
                <button type="button" className={styles.ctaButton} onClick={handleComplete}>
                  Entendi
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepVisual({ stepId, active, reducedMotion }) {
  switch (stepId) {
    case 'scattered':
      return (
        <div className={styles.institutionsRow}>
          {MOCK_INSTITUTIONS.map((inst) => (
            <FinancialInstitutionNode key={inst.id} institution={inst} />
          ))}
        </div>
      );
    case 'authorization':
      return <SecureConnectionCore mode="shield" showConsent={active} pulse={!reducedMotion} />;
    case 'sync':
      return <DataPulse active={active && !reducedMotion} />;
    case 'organize':
      return <OrganizedDataPreview active={active} />;
    case 'intelligence':
      return (
        <UniProcessingSteps
          key={active ? 'active' : 'inactive'}
          active={active}
          durationMs={1500}
          reducedMotion={reducedMotion}
        />
      );
    case 'benefit':
      return (
        <div className={styles.summaryCard}>
          <div className={styles.summaryFigure}>
            <span className={styles.summaryLabel}>Saldo estimado</span>
            <span className={styles.summaryValue}>R$ 4.320,00</span>
          </div>
          <svg className={styles.summarySpark} viewBox="0 0 56 28" fill="none" aria-hidden="true">
            <polyline
              points="0,22 10,18 18,20 26,10 36,13 46,4 56,7"
              stroke="var(--uf-green)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.comingSoonPill}>Em breve</span>
        </div>
      );
    default:
      return null;
  }
}
