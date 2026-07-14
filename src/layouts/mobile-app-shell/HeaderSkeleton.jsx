import styles from './MobileContextHeader.module.css';

function HeaderSkeleton({ variant = 'full' }) {
  return (
    <header className={`${styles.contextHeader} ${styles.headerSkeleton}`} aria-label="Carregando contexto">
      <div className={styles.identityZone}>
        <span className={`${styles.avatar} ${styles.skeletonShape}`} aria-hidden="true" />
        <span className={styles.skeletonText} aria-hidden="true">
          <span />
          <span />
        </span>
      </div>
      {variant === 'full' ? <span className={styles.skeletonActions} aria-hidden="true" /> : null}
    </header>
  );
}

export default HeaderSkeleton;
