// Activation Engine — telemetria redigida (Fase 9).
//
// Permite SOMENTE campos estruturais por allowlist. Nunca registra: mensagem,
// resposta completa, nomes, e-mails, telefones, userId, workspaceId,
// accountId, transactionId, valores financeiros, descrições, conteúdo de
// memória, tokens ou secrets.
export const ACTIVATION_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'engineVersion',
  'activationVersion',
  'enabled',
  'shadowMode',
  'capability',
  'activationStatus',
  'rolloutMode',
  'rolloutBucket',
  'confidenceBand',
  'riskBand',
  'workspaceType',
  'dataSufficient',
  'gatesPassed',
  'gatesFailed',
  'fallbackUsed',
  'fallbackReason',
  'circuitBreakerStatus',
  'latencyMs',
  'errorCode',
]);

export function redactActivationTelemetry(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const field of ACTIVATION_TELEMETRY_ALLOWED_FIELDS) {
    if (!Object.hasOwn(safe, field)) continue;
    const value = safe[field];
    result[field] = value === null
      ? null
      : ['string', 'number', 'boolean'].includes(typeof value)
        ? value
        : '[redacted]';
  }
  return result;
}

export function buildActivationTelemetry(options = {}) {
  const safe = options ?? {};
  const gates = Array.isArray(safe.gates) ? safe.gates : [];
  const gatesPassed = gates.filter((gate) => Boolean(gate?.passed)).length;
  const gatesFailed = gates.length - gatesPassed;
  return {
    engineVersion: safe.engineVersion ?? null,
    activationVersion: safe.activationVersion ?? null,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    capability: safe.capability ?? 'UNKNOWN',
    activationStatus: safe.activationStatus ?? 'UNKNOWN',
    rolloutMode: safe.rolloutMode ?? 'OFF',
    rolloutBucket: typeof safe.rolloutBucket === 'number' ? safe.rolloutBucket : null,
    confidenceBand: safe.confidenceBand ?? null,
    riskBand: safe.riskBand ?? null,
    workspaceType: safe.workspaceType ?? null,
    dataSufficient: Boolean(safe.dataSufficient),
    gatesPassed,
    gatesFailed,
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: safe.fallbackReason ?? null,
    circuitBreakerStatus: safe.circuitBreakerStatus ?? 'closed',
    latencyMs: typeof safe.latencyMs === 'number' ? Number(safe.latencyMs.toFixed(2)) : null,
    errorCode: safe.errorCode ?? null,
  };
}

export function emitActivationTelemetry(telemetry, adapter = null) {
  const redacted = redactActivationTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca quebra o motor nem o chat.
    }
    return redacted;
  }
  if (typeof console?.debug === 'function') {
    console.debug('[uni-engine] activation', redacted);
  }
  return redacted;
}
