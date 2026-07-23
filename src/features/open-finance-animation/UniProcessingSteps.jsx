import { useEffect, useState } from 'react';
import styles from './OpenFinanceConnectionAnimation.module.css';
import { MOCK_UNI_STAGES } from './openFinanceAnimationSteps.js';

/**
 * Cycles through the four Uni processing stages while this step is active.
 * Respects prefers-reduced-motion by advancing once, not looping.
 */
export default function UniProcessingSteps({ active, durationMs = 1600, reducedMotion = false }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!active || reducedMotion) return undefined;
    const stepMs = Math.max(280, Math.round(durationMs / MOCK_UNI_STAGES.length));
    const timer = setInterval(() => {
      setActiveIndex((prev) => Math.min(prev + 1, MOCK_UNI_STAGES.length - 1));
    }, stepMs);
    return () => clearInterval(timer);
  }, [active, durationMs, reducedMotion]);

  const visibleIndex = reducedMotion ? MOCK_UNI_STAGES.length - 1 : activeIndex;

  return (
    <ul className={styles.uniStageList} aria-label="Etapas de processamento da Uni">
      {MOCK_UNI_STAGES.map((stage, i) => (
        <li key={stage} className={styles.uniStageItem} data-active={i <= visibleIndex}>
          <span className={styles.uniStageDot} />
          {stage}
        </li>
      ))}
    </ul>
  );
}
