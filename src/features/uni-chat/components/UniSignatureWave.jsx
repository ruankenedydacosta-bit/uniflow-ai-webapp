import styles from './UniSignatureWave.module.css';

export default function UniSignatureWave({ variant = 'idle', size = 44 }) {
  const isSuccess = variant === 'success';

  return (
    <svg
      className={`${styles.wave} ${styles[variant]}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={
        isSuccess
          ? 'Ação confirmada pela Uni'
          : variant === 'thinking'
          ? 'Uni está pensando'
          : 'Uni'
      }
    >
      <defs>
        <linearGradient id={`uniGrad-${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
          {isSuccess ? (
            <>
              <stop offset="0%" stopColor="#22C58E" />
              <stop offset="100%" stopColor="#17A673" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#2E5CFF" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </>
          )}
        </linearGradient>
      </defs>

      <circle
        className={styles.ring}
        cx="32"
        cy="32"
        r="27"
        fill="none"
        stroke={`url(#uniGrad-${variant})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      <path
        className={styles.path}
        d="M12 34 C 20 22, 26 46, 32 32 S 44 20, 52 32"
        fill="none"
        stroke={`url(#uniGrad-${variant})`}
        strokeWidth="3"
        strokeLinecap="round"
      />

      <circle className={`${styles.dot} ${styles.dot1}`} cx="16" cy="32" r="2.4" fill={`url(#uniGrad-${variant})`} />
      <circle className={`${styles.dot} ${styles.dot2}`} cx="32" cy="32" r="2.8" fill={`url(#uniGrad-${variant})`} />
      <circle className={`${styles.dot} ${styles.dot3}`} cx="48" cy="32" r="2.4" fill={`url(#uniGrad-${variant})`} />
    </svg>
  );
}
