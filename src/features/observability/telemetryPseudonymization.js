import { TELEMETRY_IDENTITY_SCOPES, deepFreezeTelemetry } from './telemetryContracts.js';

const ENCODER = new TextEncoder();

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createTelemetrySessionSalt(cryptoProvider = globalThis.crypto) {
  try {
    if (typeof cryptoProvider?.getRandomValues !== 'function') return null;
    const bytes = new Uint8Array(16);
    cryptoProvider.getRandomValues(bytes);
    return toHex(bytes);
  } catch {
    return null;
  }
}

export async function pseudonymizeIdentifier(value, {
  scope,
  sessionSalt,
  cryptoProvider = globalThis.crypto,
} = {}) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!TELEMETRY_IDENTITY_SCOPES.includes(scope)) return null;
  if (typeof sessionSalt !== 'string' || sessionSalt.length < 16) return null;
  if (typeof cryptoProvider?.subtle?.digest !== 'function') return null;

  try {
    const input = ENCODER.encode(`uniflow.telemetry.v1|${sessionSalt}|${scope}|${value}`);
    const digest = await cryptoProvider.subtle.digest('SHA-256', input);
    return `psn_${toHex(new Uint8Array(digest)).slice(0, 32)}`;
  } catch {
    return null;
  }
}

export async function createPseudonymousCorrelation(identity = {}, options = {}) {
  const safeIdentity = identity && typeof identity === 'object' ? identity : {};
  const correlation = {};

  for (const scope of TELEMETRY_IDENTITY_SCOPES) {
    const sourceKey = `${scope}Id`;
    const pseudonym = await pseudonymizeIdentifier(safeIdentity[sourceKey], {
      ...options,
      scope,
    });
    if (pseudonym) correlation[scope] = pseudonym;
  }

  return deepFreezeTelemetry(correlation);
}
