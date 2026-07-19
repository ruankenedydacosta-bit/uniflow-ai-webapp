import styles from './GoalSkeleton.module.css';

export default function GoalSkeleton() {
  return (
    <div className={styles.grid}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.card} aria-hidden="true">
          <div className={styles.line} style={{ width: '40%' }} />
          <div className={styles.line} style={{ width: '70%' }} />
          <div className={styles.bar} />
          <div className={styles.line} style={{ width: '50%' }} />
          <div className={styles.line} style={{ width: '30%' }} />
        </div>
      ))}
    </div>
  );
}
