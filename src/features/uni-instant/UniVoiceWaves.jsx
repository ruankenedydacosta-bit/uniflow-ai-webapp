import { useId } from 'react';
import styles from './UniVoiceWaves.module.css';

const KNOWN_PHASES = new Set([
  'idle', 'pressing', 'listening', 'transcribing', 'processing',
  'responding', 'completed', 'canceled', 'error',
]);

const PATHS = [
  'M6,44 C34,18 56,66 88,40 C118,16 142,62 172,38 C190,26 202,44 214,44',
  'M14,44 C42,60 64,24 94,46 C122,66 148,22 174,44 C190,55 200,40 208,44',
  'M2,44 C32,32 58,52 86,36 C114,22 140,56 166,42 C184,34 202,48 218,44',
  'M22,44 C48,30 70,56 96,42 C120,30 146,52 162,40 C178,32 190,48 198,44',
];

export default function UniVoiceWaves({ active = false, reducedMotion = false, phase }) {
  const rawId = useId();
  const gradientId = `uni-frequency-${rawId.replace(/:/g, '')}`;
  const resolvedPhase = KNOWN_PHASES.has(phase) ? phase : active ? 'listening' : 'idle';

  if (reducedMotion) {
    return (
      <span
        className={styles.staticGlow}
        data-phase={resolvedPhase}
        data-active={resolvedPhase !== 'idle'}
        aria-hidden="true"
      />
    );
  }

  return (
    <svg
      className={styles.freqField}
      data-phase={resolvedPhase}
      viewBox="0 0 220 88"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="48%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <g className={styles.freqGroup}>
        {PATHS.map((path, index) => (
          <path
            key={path}
            className={`${styles.freqLine} ${styles[`line${index + 1}`]}`}
            d={path}
            stroke={`url(#${gradientId})`}
          />
        ))}
      </g>
    </svg>
  );
}
