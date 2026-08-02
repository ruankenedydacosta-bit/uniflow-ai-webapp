// Integration — redação de telemetria (Parte 1).
//
// Permite SOMENTE campos estruturais por allowlist. Nunca registra: texto da
// resposta, mensagem, nomes, e-mails, telefones, userId, workspaceId, IDs de
// conta/transação, valores financeiros, descrições, memória, tokens ou
// secrets.
export const INTEGRATION_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'version',
  'enabled',
  'shadowMode',
  'status',
  'applied',
  'capabilitiesRequested',
  'capabilitiesApplied',
  'responseType',
  'legacyPreserved',
  'fallbackUsed',
  'fallbackReason',
  'questionApplied',
  'clarificationApplied',
  'styleApplied',
  'lengthApplied',
  'styleKey',
  'lengthBand',
  'latencyMs',
  'errorCode',
]);

export function redactIntegrationTelemetry(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const field of INTEGRATION_TELEMETRY_ALLOWED_FIELDS) {
    if (!Object.hasOwn(safe, field)) continue;
    const value = safe[field];
    if (Array.isArray(value)) {
      result[field] = value
        .filter((item) => typeof item === 'string')
        .slice(0, 6);
      continue;
    }
    if (value === null) {
      result[field] = null;
      continue;
    }
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      result[field] = value;
      continue;
    }
    result[field] = '[redacted]';
  }
  return result;
}
