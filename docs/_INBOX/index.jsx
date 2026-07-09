import { cx } from '../../../lib/cx';
import styles from './ProgressBar.module.css';

/**
 * ProgressBar — barra de progresso genérica (0–100). Usada por Goals do
 * Dashboard; o Onboarding tem uma versão local equivalente que deveria
 * migrar para este componente (ver nota em ProgressBar.module.css).
 *
 * @param {{ value: number, variant?: 'primary'|'success', label?: string }} props
 */
export default function ProgressBar({ value, variant = 'primary', label }) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cx(styles.fill, variant === 'success' && styles.success)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
