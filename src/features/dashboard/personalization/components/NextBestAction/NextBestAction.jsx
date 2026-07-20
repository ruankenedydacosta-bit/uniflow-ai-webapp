import Button from '../../../../../components/ui/Button/Button.jsx';
import styles from './NextBestAction.module.css';

function NextBestAction({ action, onNavigate, variant = 'desktop' }) {
  if (!action) return null;

  const { title, cta, href } = action;

  if (variant === 'mobile') {
    return (
      <>
        <div className="homeMobileNextStepBody">
          <span className="homeMobileActionIcon" aria-hidden="true">✓</span>
          <h2 id="home-mobile-next-step-title">{title}</h2>
        </div>
        <button
          type="button"
          className="homeMobilePrimaryAction"
          onClick={() => onNavigate?.(href)}
        >
          {cta}
        </button>
      </>
    );
  }

  return (
    <div className={styles.desktopContainer}>
      <p className={styles.desktopTitle}>{title}</p>
      <Button
        variant="primary"
        size="md"
        className={styles.desktopCta}
        onClick={() => onNavigate?.(href)}
      >
        {cta}
      </Button>
    </div>
  );
}

export default NextBestAction;
