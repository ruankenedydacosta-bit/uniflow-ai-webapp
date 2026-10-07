import { useEffect, useSyncExternalStore } from 'react';
import { getPwaUpdateManager, UPDATE_STATUS } from './pwaUpdateStore.js';
import styles from './PwaUpdateCard.module.css';

function PwaUpdateCard({ blocked = false }) {
  const manager = getPwaUpdateManager();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);

  // O update automático não recarrega a página no meio de voz ou de uma
  // ação pendente; volta a valer assim que ela termina.
  useEffect(() => {
    manager.setAutoUpdateBlocked(blocked);
    return () => manager.setAutoUpdateBlocked(false);
  }, [manager, blocked]);
  const visible = state.updateAvailable
    || state.status === UPDATE_STATUS.UPDATING
    || state.status === UPDATE_STATUS.FAILED;

  if (!visible) return null;

  const isUpdating = state.status === UPDATE_STATUS.UPDATING;
  const isRetry = state.status === UPDATE_STATUS.FAILED;
  const disabled = blocked || isUpdating;

  async function updateNow() {
    if (disabled) return;
    await manager.applyUpdate({ retry: isRetry });
  }

  return (
    <aside className={styles.card} aria-labelledby="uniflow-update-title" data-uniflow-update-card>
      <span className={styles.icon} aria-hidden="true">✨</span>
      <div className={styles.content}>
        <h2 id="uniflow-update-title">Nova atualização disponível</h2>
        <p>{state.error ?? 'Uma nova versão da UniFlow está pronta.'}</p>
        {blocked ? <small>Conclua a ação atual para atualizar com segurança.</small> : null}
      </div>
      <button type="button" onClick={updateNow} disabled={disabled} aria-busy={isUpdating}>
        {isUpdating ? 'Atualizando...' : isRetry ? 'Tentar novamente' : 'Atualizar agora'}
      </button>
    </aside>
  );
}

export default PwaUpdateCard;
