export const MOCK_HEALTH_STATES = Object.freeze([
  'UNKNOWN',
  'HEALTHY',
  'DEGRADED',
  'OFFLINE',
]);

export function normalizeMockHealth(status = 'HEALTHY') {
  const normalized = typeof status === 'string' ? status.trim().toUpperCase() : 'UNKNOWN';
  return MOCK_HEALTH_STATES.includes(normalized) ? normalized : 'UNKNOWN';
}

export function createMockHealthSnapshot(status = 'HEALTHY', initialized = false) {
  const healthStatus = normalizeMockHealth(status);
  return Object.freeze({
    provider: 'UNI_OS_MOCK',
    healthStatus,
    available: initialized && ['HEALTHY', 'DEGRADED'].includes(healthStatus),
    initialized,
    externalCheckPerformed: false,
  });
}
