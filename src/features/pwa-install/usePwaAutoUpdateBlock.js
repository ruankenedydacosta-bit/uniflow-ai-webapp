import { useEffect } from 'react';
import { getPwaUpdateManager } from './pwaUpdateStore.js';

// O update automático não recarrega a página no meio de voz ou de uma
// ação pendente; volta a valer assim que ela termina.
export function usePwaAutoUpdateBlock(blocked) {
  useEffect(() => {
    const manager = getPwaUpdateManager();
    manager.setAutoUpdateBlocked(blocked);
    return () => manager.setAutoUpdateBlocked(false);
  }, [blocked]);
}
