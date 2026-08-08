import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';
import {
  initializeTelemetry,
  installGlobalTelemetryHandlers,
  recordReactError,
  recordReactRecoverableError,
  telemetry,
} from './features/observability/index.js';
import { ThemeProvider } from './features/theme';
import { VoiceProvider } from './features/uni-audio/index.js';
import { initializePwaInstallCapture } from './features/pwa-install/index.js';
import './styles/index.css';

const bootstrapStartedAt = globalThis.performance?.now?.() ?? Date.now();
initializeTelemetry();
const removeGlobalTelemetryHandlers = installGlobalTelemetryHandlers();
const removePwaInstallCapture = initializePwaInstallCapture();
import.meta.hot?.dispose(() => {
  removeGlobalTelemetryHandlers();
  removePwaInstallCapture();
});

ReactDOM.createRoot(document.getElementById('root'), {
  onUncaughtError: (error) => {
    void recordReactError(error);
  },
  onRecoverableError: (error) => {
    void recordReactRecoverableError(error);
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
