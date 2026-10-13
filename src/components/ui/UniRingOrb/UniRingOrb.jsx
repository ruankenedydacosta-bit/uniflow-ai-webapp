import { useCallback, useId, useRef } from 'react';
import { useVoiceIntensity } from '../../../features/uni-voice-realtime/useVoiceIntensity.js';
import { cx } from '../../../utils/cx.js';
import {
  resolveUniRingOrbMotion,
  resolveUniRingThickness,
  UNI_RING_ORB_MIN_MARK_SIZE,
  UNI_RING_ORB_STATES,
} from './uniRingOrbModel.js';
import styles from './UniRingOrb.module.css';

const RIPPLE_CLASSES = [styles.rippleBlue, styles.ripplePurple, styles.rippleGreen];

// Símbolo oficial em vetor: os dois U precisam ser caminhos separados para
// girarem cada um no seu sentido.
function UniRingMark({ markDuration }) {
  const gradientId = useId();
  const outerId = `${gradientId}-outer`;
  const innerId = `${gradientId}-inner`;

  return (
    <svg
      className={styles.mark}
      viewBox="-1 1 38 38"
      fill="none"
      aria-hidden="true"
      style={{ '--orb-mark-duration': `${markDuration}s` }}
    >
      <defs>
        <linearGradient id={outerId} x1="6" y1="6" x2="30" y2="22" gradientUnits="userSpaceOnUse">
          <stop className={styles.stopBlue} />
          <stop offset="1" className={styles.stopPurple} />
        </linearGradient>
        <linearGradient id={innerId} x1="15" y1="11" x2="27" y2="21" gradientUnits="userSpaceOnUse">
          <stop className={styles.stopPurple} />
          <stop offset="1" className={styles.stopGreen} />
        </linearGradient>
      </defs>
      <path
        className={styles.markOuter}
        d="M6 6v16a12 12 0 0 0 24 0V6"
        stroke={`url(#${outerId})`}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        className={styles.markInner}
        d="M15 11v10a6 6 0 0 0 12 0v-6"
        stroke={`url(#${innerId})`}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle className={styles.markDot} cx="6" cy="4.5" r="2.2" />
    </svg>
  );
}

export function UniRingOrb({
  size = 64,
  state = UNI_RING_ORB_STATES.IDLE,
  className,
  getVoiceStream,
  getVoiceSessionId,
}) {
  const rootRef = useRef(null);
  const motion = resolveUniRingOrbMotion(state);
  const showsMark = size >= UNI_RING_ORB_MIN_MARK_SIZE;

  // O nível da voz vai direto para a variável CSS: nada de re-render por
  // quadro. O hook só observa o stream que o pipeline já abriu.
  const handleVoiceLevel = useCallback((level) => {
    rootRef.current?.style.setProperty('--orb-level', String(level));
  }, []);

  useVoiceIntensity({
    getStream: getVoiceStream,
    getSessionId: getVoiceSessionId,
    active: Boolean(state === UNI_RING_ORB_STATES.LISTENING && getVoiceStream),
    onLevel: handleVoiceLevel,
    publishState: false,
  });

  return (
    <span
      ref={rootRef}
      className={cx(styles.root, className)}
      data-state={state}
      aria-hidden="true"
      style={{
        '--orb-size': `${size}px`,
        '--orb-thickness': `${resolveUniRingThickness(size)}px`,
        '--orb-ring-duration': `${motion.ring}s`,
        '--orb-glow': motion.glow,
        '--orb-ripple-duration': `${motion.ripple}s`,
      }}
    >
      <span className={styles.glow} />
      {motion.ripple > 0
        ? RIPPLE_CLASSES.map((rippleClass, index) => (
          <span
            key={rippleClass}
            className={cx(styles.ripple, rippleClass)}
            style={{ animationDelay: `${(motion.ripple / RIPPLE_CLASSES.length) * index}s` }}
          />
        ))
        : null}
      <span className={styles.ring} />
      <span className={styles.ringInner} />
      {showsMark ? (
        <span className={styles.core}>
          <UniRingMark markDuration={motion.mark} />
        </span>
      ) : null}
    </span>
  );
}

export default UniRingOrb;
