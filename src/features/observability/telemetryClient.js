import {
  TELEMETRY_FOUNDATION_VERSION,
  TELEMETRY_KINDS,
  deepFreezeTelemetry,
  isTelemetryNameAllowed,
} from './telemetryContracts.js';
import { createTelemetryContext } from './telemetryContext.js';
import { dispatchTelemetryEnvelope } from './telemetryAdapters.js';
import {
  createPseudonymousCorrelation,
  createTelemetrySessionSalt,
} from './telemetryPseudonymization.js';
import { isSanitizedTelemetryData, sanitizeTelemetryData } from './telemetryRedaction.js';

function dropped(reason) {
  return deepFreezeTelemetry({ accepted: false, reason, envelope: null, delivery: null });
}

export function createTelemetryClient({
  enabled = false,
  context = {},
  adapters = [],
  sessionSalt = createTelemetrySessionSalt(),
  now = () => Date.now(),
  cryptoProvider = globalThis.crypto,
} = {}) {
  const safeContext = createTelemetryContext(context);
  const safeAdapters = Array.isArray(adapters) ? [...adapters] : [];

  async function record(kind, name, data = {}, identity = {}) {
    try {
      if (enabled !== true) return dropped('disabled');
      if (!isTelemetryNameAllowed(kind, name)) return dropped('event_not_allowed');

      const sanitizedData = sanitizeTelemetryData(kind, data);
      if (!isSanitizedTelemetryData(kind, sanitizedData)) return dropped('data_rejected');
      if (kind === TELEMETRY_KINDS.METRIC && Object.keys(sanitizedData).length === 0) {
        return dropped('metric_value_required');
      }

      const correlation = await createPseudonymousCorrelation(identity, {
        sessionSalt,
        cryptoProvider,
      });
      const envelope = deepFreezeTelemetry({
        version: TELEMETRY_FOUNDATION_VERSION,
        kind,
        name,
        timestamp: Number.isFinite(now()) ? now() : 0,
        context: safeContext,
        correlation,
        data: sanitizedData,
      });
      const delivery = await dispatchTelemetryEnvelope(envelope, safeAdapters);
      return deepFreezeTelemetry({ accepted: true, reason: null, envelope, delivery });
    } catch {
      return dropped('telemetry_internal_error');
    }
  }

  return deepFreezeTelemetry({
    enabled: enabled === true,
    context: safeContext,
    recordEvent: (name, data, identity) => record(TELEMETRY_KINDS.EVENT, name, data, identity),
    recordError: (name, data, identity) => record(TELEMETRY_KINDS.ERROR, name, data, identity),
    recordMetric: (name, data, identity) => record(TELEMETRY_KINDS.METRIC, name, data, identity),
  });
}
