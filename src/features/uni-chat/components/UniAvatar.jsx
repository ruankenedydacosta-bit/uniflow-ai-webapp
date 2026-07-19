import UniSignatureWave from './UniSignatureWave';
import styles from './UniAvatar.module.css';

export default function UniAvatar({ status = 'idle', size = 'md' }) {
  const px = size === 'lg' ? 64 : size === 'sm' ? 32 : 44;
  const wavePx = Math.round(px * 0.62);

  return (
    <div
      className={`${styles.avatar} ${styles[size]}`}
      role="img"
      aria-label={status === 'thinking' ? 'Uni pensando' : 'Uni'}
    >
      <div className={styles.glow} aria-hidden="true" />
      <UniSignatureWave variant={status === 'thinking' ? 'thinking' : 'idle'} size={wavePx} />
    </div>
  );
}
