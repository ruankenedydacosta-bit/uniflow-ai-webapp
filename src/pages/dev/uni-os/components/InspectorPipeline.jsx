import styles from '../UNIOSInspectorPage.module.css';

function InspectorPipeline({ stages }) {
  const statusLabels = {
    waiting: 'Waiting',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    shadow: 'Shadow',
  };

  return (
    <nav className={styles.pipelinePanel} aria-label="Pipeline do UNI OS">
      <div className={styles.panelHeading}>
        <span>Pipeline</span>
        <strong>{stages.length} etapas</strong>
      </div>

      <ol className={styles.pipelineList}>
        {stages.map((stage, index) => (
          <li key={stage.id} className={styles.pipelineItem} data-status={stage.status}>
            <span className={styles.stageMarker} aria-hidden="true">
              <span>{stage.code}</span>
            </span>
            <span className={styles.stageCopy}>
              <strong>{stage.label}</strong>
              <small>{statusLabels[stage.status] ?? stage.status}</small>
            </span>
            <span className={styles.stageCheck} aria-label={`${stage.label}: ${statusLabels[stage.status] ?? stage.status}`}>
              {stage.status === 'failed' ? '!' : stage.status === 'running' ? '...' : stage.status === 'waiting' ? '--' : 'OK'}
            </span>
            {index < stages.length - 1 ? <span className={styles.stageLine} aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default InspectorPipeline;
