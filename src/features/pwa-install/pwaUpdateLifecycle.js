import { getPwaUpdateManager } from './pwaUpdateStore.js';

export function initializePwaUpdateLifecycle() {
  return getPwaUpdateManager().start();
}
