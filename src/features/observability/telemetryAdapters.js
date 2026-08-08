import { deepFreezeTelemetry } from './telemetryContracts.js';

const SAFE_ADAPTER_NAME = /^[A-Za-z0-9_.:-]{1,48}$/;

export function createTelemetryAdapter({ name = 'anonymous', enabled = false, send = null } = {}) {
  return deepFreezeTelemetry({
    name: typeof name === 'string' && SAFE_ADAPTER_NAME.test(name) ? name : 'anonymous',
    enabled: enabled === true,
    send: typeof send === 'function' ? send : null,
  });
}

export function createDisabledExternalAdapter(name = 'external') {
  return createTelemetryAdapter({ name, enabled: false, send: null });
}

export async function dispatchTelemetryEnvelope(envelope, adapters = []) {
  const safeAdapters = Array.isArray(adapters) ? adapters : [];
  let delivered = 0;
  let failed = 0;

  for (const adapter of safeAdapters) {
    if (adapter?.enabled !== true || typeof adapter?.send !== 'function') continue;
    try {
      await adapter.send(envelope);
      delivered += 1;
    } catch {
      failed += 1;
    }
  }

  return deepFreezeTelemetry({ delivered, failed });
}
