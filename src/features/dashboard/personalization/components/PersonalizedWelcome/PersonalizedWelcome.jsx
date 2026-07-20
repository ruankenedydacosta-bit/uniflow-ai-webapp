import styles from './PersonalizedWelcome.module.css';

function PersonalizedWelcome({ greeting, workspaceLabel, variant = 'desktop' }) {
  if (variant === 'mobile') {
    return (
      <div className={styles.mobileWelcome}>
        <span className={styles.mobileWorkspaceBadge}>{workspaceLabel}</span>
        <h2 className={styles.mobileGreeting}>{greeting}</h2>
      </div>
    );
  }

  return (
    <div className={styles.desktopWelcome}>
      <h2 id="dashboard-title" className={styles.desktopGreeting}>{greeting}</h2>
    </div>
  );
}

export default PersonalizedWelcome;
