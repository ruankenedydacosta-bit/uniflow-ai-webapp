import { getPwaUpdateManager } from './pwaUpdateStore.js';

// PWA-UPDATE3/INVARIANTE: unico jeito de provar as 3 identidades de build
// (runtime/server/SW) num aparelho fisico -- chamado manualmente pelo
// Safari Web Inspector remoto durante o TESTE FISICO CONTROLADO do
// incidente. Nunca invocado por nenhuma tela/fluxo do app -- so existe no
// console, nunca visivel a um usuario comum.
export function exposePwaDiagnosticConsoleHelper(manager, runtime = globalThis) {
  if (runtime) runtime.__uniflowPwaDiagnostic = () => manager.getDiagnosticSnapshot();
  return () => {
    if (runtime && '__uniflowPwaDiagnostic' in runtime) delete runtime.__uniflowPwaDiagnostic;
  };
}

export function initializePwaUpdateLifecycle() {
  const manager = getPwaUpdateManager();
  const removeConsoleHelper = exposePwaDiagnosticConsoleHelper(manager);
  const stop = manager.start();
  return () => {
    stop();
    removeConsoleHelper();
  };
}
