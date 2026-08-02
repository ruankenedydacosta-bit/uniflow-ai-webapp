// Observability da Uni Engine (Fase 10 — Production Readiness).
//
// Tipos fechados do snapshot observável. Nada aqui contém dados sensíveis:
// apenas flags, versões, latências, bandas, status e agregados.
export const OBSERVABILITY_MODULE_STATUSES = Object.freeze([
  'active',
  'disabled',
  'inconsistent',
  'error',
  'unknown',
]);

export const OBSERVABILITY_SNAPSHOT_VERSION = '1.0';

export function isValidObservabilityModuleStatus(value) {
  return OBSERVABILITY_MODULE_STATUSES.includes(value);
}

// Bandas de confiança para o snapshot (nunca valores exatos).
export function observabilityConfidenceBand(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value >= 0.8) return 'high';
  if (value >= 0.6) return 'medium';
  if (value >= 0.4) return 'low';
  return 'very_low';
}

// Bandas de risco para o snapshot (nunca detalhes).
export function observabilityRiskBand(value) {
  return typeof value === 'string' && value ? value : null;
}

// Campos permitidos na telemetria observável (allowlist rígida).
export const OBSERVABILITY_ALLOWED_FIELDS = Object.freeze([
  'version',
  'engineVersion',
  'revision',
  'correlationId',
  'timestamp',
  'totalLatencyMs',
  'health',
  'modules',
  'activeModules',
  'disabledModules',
  'errorModules',
  'latencyByModule',
  'flags',
  'confidence',
  'risk',
  'shadow',
  'fallback',
  'activation',
  'reflection',
  'goals',
  'planning',
  'circuitBreaker',
  'telemetry',
]);
