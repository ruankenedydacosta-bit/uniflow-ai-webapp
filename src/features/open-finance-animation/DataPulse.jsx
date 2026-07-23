import styles from './OpenFinanceConnectionAnimation.module.css';

// Three simple SVG motion-paths converging left-to-center, one per institution.
// Kept as plain <path> offset-path values (CSS motion path) rather than a heavy
// animation library, per the "no external animation libraries" constraint.
const PATHS = [
  'path("M 0 20 C 60 20, 120 90, 200 90")',
  'path("M 0 90 C 60 90, 120 90, 200 90")',
  'path("M 0 160 C 60 160, 120 90, 200 90")',
];

const DOT_COUNT_PER_PATH = 3;

export default function DataPulse({ active = true }) {
  return (
    <div className={styles.pulseField} aria-hidden="true">
      <svg width="0" height="0">
        <defs />
      </svg>
      {PATHS.map((path, pathIndex) =>
        Array.from({ length: DOT_COUNT_PER_PATH }).map((_, dotIndex) => {
          const delay = pathIndex * 220 + dotIndex * 520;
          return (
            <span
              key={`${pathIndex}-${dotIndex}`}
              className={styles.pulseDot}
              data-active={active}
              style={{
                offsetPath: path,
                animationDuration: '1.6s',
                animationDelay: `${delay}ms`,
                animationIterationCount: active ? 'infinite' : 0,
              }}
            />
          );
        })
      )}
    </div>
  );
}
