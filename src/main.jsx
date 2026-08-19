import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';
import { initializeGa4 } from './features/analytics/ga4Client.js';
import { initializeAnalyticsConsent } from './features/analytics/analyticsConsentController.js';
import {
  initializeTelemetry,
  installGlobalTelemetryHandlers,
  recordReactError,
  recordReactRecoverableError,
  telemetry,
} from './features/observability/index.js';
import { ThemeProvider } from './features/theme';
import { VoiceProvider } from './features/uni-audio/index.js';
import {
  initializePwaInstallCapture,
  initializePwaUpdateLifecycle,
} from './features/pwa-install/index.js';
import { isChunkLoadError, recoverFromChunkLoadError } from './features/pwa-install/chunkLoadRecovery.js';
import './styles/index.css';

// PWA-UPDATE3: um runtime antigo em memoria pode tentar buscar um chunk
// com hash de um deploy anterior (ex.: rota carregada via lazy() so agora,
// minutos/horas depois do load inicial). Sem isto, o erro so era
// reportado via telemetry (ver onUncaughtError/onRecoverableError abaixo)
// e a tela ficava em branco -- nenhuma recuperacao de verdade. UM reload
// guardado (nunca loop) resolve, porque index.html do Vercel ja e servido
// com must-revalidate (proxima carga sempre pega o manifesto de chunks
// atual).
function recoverIfChunkLoadError(error) {
  if (isChunkLoadError(error)) recoverFromChunkLoadError();
}

const bootstrapStartedAt = globalThis.performance?.now?.() ?? Date.now();
initializeGa4();
initializeAnalyticsConsent();
initializeTelemetry();
const removeGlobalTelemetryHandlers = installGlobalTelemetryHandlers();
const removePwaInstallCapture = initializePwaInstallCapture();
const removePwaUpdateLifecycle = initializePwaUpdateLifecycle();

// PWA-UPDATE3: cobre o caso em que a falha do dynamic import() nunca chega
// a virar um erro de render do React (ex.: uma rejeicao que sobra sem
// tratamento antes do Suspense/lazy processa-la). installGlobalTelemetryHandlers
// ja reporta este mesmo evento para telemetry -- este listener so ADICIONA
// a checagem/recuperacao de chunk stale, nunca duplica o log.
function handleUnhandledRejectionForChunkRecovery(event) {
  recoverIfChunkLoadError(event?.reason);
}
globalThis.addEventListener?.('unhandledrejection', handleUnhandledRejectionForChunkRecovery);

import.meta.hot?.dispose(() => {
  removeGlobalTelemetryHandlers();
  removePwaInstallCapture();
  removePwaUpdateLifecycle();
  globalThis.removeEventListener?.('unhandledrejection', handleUnhandledRejectionForChunkRecovery);
});

ReactDOM.createRoot(document.getElementById('root'), {
  onUncaughtError: (error) => {
    void recordReactError(error);
    recoverIfChunkLoadError(error);
  },
  onRecoverableError: (error) => {
    void recordReactRecoverableError(error);
    recoverIfChunkLoadError(error);
  },
}).render(
  <React.StrictMode>
    <ThemeProvider>
      <VoiceProvider>
        <App />
      </VoiceProvider>
    </ThemeProvider>
  </React.StrictMode>
);

globalThis.queueMicrotask?.(() => {
  const finishedAt = globalThis.performance?.now?.() ?? Date.now();
  void telemetry.metric('bootstrap.latency_ms', {
    value: Math.max(0, finishedAt - bootstrapStartedAt),
    unit: 'ms',
    source: 'react',
    status: 'rendered',
  });
});
