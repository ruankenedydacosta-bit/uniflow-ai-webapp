import { normalizeTelemetryErrorCode, telemetry } from './telemetryRuntime.js';

export function installGlobalTelemetryHandlers({ runtime = globalThis, api = telemetry } = {}) {
  if (typeof runtime?.addEventListener !== 'function') return () => {};

  const handleError = (event) => {
    void api.error('bootstrap.failure', {
      errorCode: normalizeTelemetryErrorCode(event?.error?.name, 'UNHANDLED_ERROR'),
      stage: 'global_error',
      source: 'browser',
      recoverable: false,
    });
  };
  const handleRejection = (event) => {
    void api.error('bootstrap.failure', {
      errorCode: normalizeTelemetryErrorCode(event?.reason?.name, 'UNHANDLED_REJECTION'),
      stage: 'unhandled_rejection',
      source: 'browser',
      recoverable: false,
    });
  };

  runtime.addEventListener('error', handleError);
  runtime.addEventListener('unhandledrejection', handleRejection);
  return () => {
    runtime.removeEventListener?.('error', handleError);
    runtime.removeEventListener?.('unhandledrejection', handleRejection);
  };
}

export function recordReactError(error, {
  api = telemetry,
  recoverable = false,
  stage = 'react_uncaught',
} = {}) {
  return api.error('bootstrap.failure', {
    errorCode: normalizeTelemetryErrorCode(error?.name, 'REACT_ERROR'),
    stage,
    source: 'react',
    recoverable,
  });
}

export function recordReactRecoverableError(error, api = telemetry) {
  return recordReactError(error, {
    api,
    recoverable: true,
    stage: 'react_recoverable',
  });
}
