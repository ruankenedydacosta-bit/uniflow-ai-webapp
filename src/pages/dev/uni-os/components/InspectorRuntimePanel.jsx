import Badge from '../../../../components/ui/Badge';
import styles from '../UNIOSInspectorPage.module.css';

function BooleanStatus({ value }) {
  return (
    <Badge variant={value ? 'success' : 'outline'} size="sm" dot={value}>
      {value ? 'Ativo' : 'Inativo'}
    </Badge>
  );
}

function InspectorRuntimePanel({ runtime, displayTime }) {
  const metrics = [
    ['Version', runtime.version],
    ['Pipeline Status', runtime.pipeline],
    ['Shadow Mode', <BooleanStatus value={runtime.shadowMode} />],
    ['Execution Allowed', <BooleanStatus value={runtime.executionAllowed} />],
    ['Deep Freeze', <BooleanStatus value={runtime.deepFreeze} />],
    ['Adapters Executed', runtime.adaptersExecuted],
    ['Execution Time', `${runtime.executionTimeMs} ms`],
    ['Validation Result', runtime.validationResult],
    ['Feature Flag', <BooleanStatus value={runtime.featureFlag} />],
  ];

  return (
    <aside className={styles.runtimePanel} aria-labelledby="runtime-panel-title">
      <div className={styles.panelHeading}>
        <span>Runtime</span>
        <Badge variant={runtime.source === 'runtime' ? 'success' : 'warning'} size="sm" dot>
          {runtime.source === 'runtime' ? 'Stable' : 'Fallback'}
        </Badge>
      </div>

      <div className={styles.runtimePulse} aria-hidden="true">
        <span />
      </div>

      <dl className={styles.runtimeList}>
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <footer className={styles.runtimeFooter}>
        <span id="runtime-panel-title">
          {runtime.source === 'runtime' ? 'Shadow runtime snapshot' : 'Mock runtime snapshot'}
        </span>
        <time dateTime={runtime.timestamp}>{displayTime}</time>
      </footer>
    </aside>
  );
}

export default InspectorRuntimePanel;
