import InspectorCommunicationCard from './components/InspectorCommunicationCard.jsx';
import InspectorContextCard from './components/InspectorContextCard.jsx';
import InspectorGatewayCard from './components/InspectorGatewayCard.jsx';
import InspectorHeader from './components/InspectorHeader.jsx';
import InspectorMemoryCard from './components/InspectorMemoryCard.jsx';
import InspectorParsedIntentCard from './components/InspectorParsedIntentCard.jsx';
import InspectorPermissionsCard from './components/InspectorPermissionsCard.jsx';
import InspectorPipeline from './components/InspectorPipeline.jsx';
import InspectorPlanningCard from './components/InspectorPlanningCard.jsx';
import InspectorReflectionCard from './components/InspectorReflectionCard.jsx';
import InspectorResponseCard from './components/InspectorResponseCard.jsx';
import InspectorRuntimePanel from './components/InspectorRuntimePanel.jsx';
import InspectorSecurityCard from './components/InspectorSecurityCard.jsx';
import { useInspectorRuntime } from './hooks/useInspectorRuntime.js';
import styles from './UNIOSInspectorPage.module.css';

function UNIOSInspectorPage() {
  const {
    runtime,
    stages,
    displayTime,
    isMockRuntime,
    isRefreshing,
    refresh,
  } = useInspectorRuntime();

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <InspectorHeader
          displayTime={displayTime}
          version={runtime.version}
          isMockRuntime={isMockRuntime}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
        />

        <div className={styles.inspectorLayout}>
          <InspectorPipeline stages={stages} />

          <section className={styles.cardsRegion} aria-label="Snapshots do UNI OS">
            <InspectorParsedIntentCard data={runtime.parsedIntent} />
            <InspectorContextCard data={runtime.context} />
            <InspectorMemoryCard data={runtime.memory} />
            <InspectorPlanningCard data={runtime.planning} />
            <InspectorReflectionCard data={runtime.reflection} />
            <InspectorSecurityCard data={runtime.security} />
            <InspectorPermissionsCard data={runtime.permissions} />
            <InspectorGatewayCard data={runtime.gateway} />
            <InspectorResponseCard data={runtime.response} />
            <InspectorCommunicationCard data={runtime.communication} />
          </section>

          <InspectorRuntimePanel runtime={runtime} displayTime={displayTime} />
        </div>
      </div>
    </main>
  );
}

export default UNIOSInspectorPage;
