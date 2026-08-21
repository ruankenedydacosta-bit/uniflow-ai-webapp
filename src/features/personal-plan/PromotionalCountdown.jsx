import { useEffect, useState } from 'react';
import {
  getPromotionDocumentContext,
  getPromotionRemainingSeconds,
  resolvePromotionExpiry,
  splitPromotionCountdown,
} from './promotionalCountdown.js';
import styles from './PlanPromotionCard.module.css';

function CountdownDigit({ value, previousValue, revision }) {
  const changed = previousValue !== value;
  return (
    <span className={styles.countdownDigitWindow} aria-hidden="true">
      {changed ? (
        <span key={`${revision}-out`} className={styles.countdownDigitOutgoing}>
          {previousValue}
        </span>
      ) : null}
      <span
        key={`${revision}-in`}
        className={changed ? styles.countdownDigitIncoming : styles.countdownDigitStable}
      >
        {value}
      </span>
    </span>
  );
}

function CountdownUnit({ value, previousValue, label, revision }) {
  return (
    <span className={styles.countdownUnit}>
      <span className={styles.countdownNumber}>
        {value.split('').map((digit, index) => (
          <CountdownDigit
            key={`${label}-${index}`}
            value={digit}
            previousValue={previousValue[index]}
            revision={revision}
          />
        ))}
      </span>
      <span className={styles.countdownLabel}>{label}</span>
    </span>
  );
}

function PromotionalCountdown({ canStartNewWindow = true }) {
  const [expiresAt] = useState(() => {
    if (typeof window === 'undefined') return null;

    return resolvePromotionExpiry(
      window.sessionStorage,
      Date.now(),
      {
        canStartNewWindow,
        ...getPromotionDocumentContext(window),
      },
    );
  });
  const [timer, setTimer] = useState(() => {
    const remainingSeconds = getPromotionRemainingSeconds(expiresAt);
    const countdown = splitPromotionCountdown(remainingSeconds);
    return {
      remainingSeconds,
      countdown,
      previousCountdown: countdown,
      revision: 0,
    };
  });

  useEffect(() => {
    const updateRemaining = () => {
      const remainingSeconds = getPromotionRemainingSeconds(expiresAt);
      setTimer((currentTimer) => {
        if (remainingSeconds === currentTimer.remainingSeconds) return currentTimer;
        return {
          remainingSeconds,
          countdown: splitPromotionCountdown(remainingSeconds),
          previousCountdown: currentTimer.countdown,
          revision: currentTimer.revision + 1,
        };
      });
    };
    const intervalId = window.setInterval(updateRemaining, 250);
    document.addEventListener('visibilitychange', updateRemaining);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', updateRemaining);
    };
  }, [expiresAt]);

  const { countdown, previousCountdown, revision } = timer;
  const accessibleTime = `${countdown.hours} horas, ${countdown.minutes} minutos e ${countdown.seconds} segundos`;

  return (
    <div className={styles.countdown} aria-label={`Oferta especial: ${accessibleTime} restantes`}>
      <div className={styles.offerLabel}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13.2 2 4 13.2h6.4L9.8 22 20 9.5h-6.6Z" />
        </svg>
        <span>OFERTA ESPECIAL</span>
      </div>

      <div className={styles.countdownDisplay} aria-hidden="true">
        <CountdownUnit
          value={countdown.hours}
          previousValue={previousCountdown.hours}
          label="HORAS"
          revision={revision}
        />
        <span className={styles.countdownSeparator}>:</span>
        <CountdownUnit
          value={countdown.minutes}
          previousValue={previousCountdown.minutes}
          label="MINUTOS"
          revision={revision}
        />
        <span className={styles.countdownSeparator}>:</span>
        <CountdownUnit
          value={countdown.seconds}
          previousValue={previousCountdown.seconds}
          label="SEGUNDOS"
          revision={revision}
        />
      </div>

      <p>A oferta termina em breve!</p>
    </div>
  );
}

export default PromotionalCountdown;
