import Badge from '../../../../components/ui/Badge';
import styles from '../UNIOSInspectorPage.module.css';

function InspectorHeader({ displayTime, version, isMockRuntime, isRefreshing, onRefresh }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <span className={styles.kicker}>Engineering observability</span>
        <h1>UNI OS Inspector</h1>
        <p>Uma leitura visual do pipeline cognitivo em modo sombra.</p>
      </div>

      <div className={styles.headerMeta}>
        <div className={styles.badges} aria-label="Estado do Inspector">
          <Badge variant="warning" size="sm" dot>Development Only</Badge>
          <Badge variant="secondary" size="sm" dot>Shadow Mode</Badge>
          {isMockRuntime ? <Badge variant="outline" size="sm" dot>Mock Runtime</Badge> : null}
          <Badge variant="glass" size="sm">UNI OS v{version.split('.')[0]}</Badge>
        </div>
        <div className={styles.headerControls}>
          <span className={styles.timestamp}>Snapshot {displayTime}</span>
          <button
            className={styles.refreshButton}
            type="button"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            {isRefreshing ? 'Refreshing' : 'Refresh Runtime'}
          </button>
        </div>
      </div>
    </header>
  );
}

export default InspectorHeader;
