import styles from './MobileContextHeader.module.css';

function HeaderIdentityBlock({ greeting = 'Bem-vindo novamente', displayName = 'UniFlow' }) {
  return (
    <div className={styles.identityBlock}>
      <span className={styles.greeting}>{greeting}</span>
      <strong className={styles.displayName} title={displayName}>{displayName}</strong>
    </div>
  );
}

export default HeaderIdentityBlock;
