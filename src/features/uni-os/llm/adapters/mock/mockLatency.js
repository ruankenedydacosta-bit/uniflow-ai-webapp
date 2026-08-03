export const MOCK_LATENCY_PROFILES = Object.freeze({
  FAST: Object.freeze({ id: 'FAST', estimatedMs: 1, delayMs: 0, timeout: false }),
  NORMAL: Object.freeze({ id: 'NORMAL', estimatedMs: 120, delayMs: 1, timeout: false }),
  SLOW: Object.freeze({ id: 'SLOW', estimatedMs: 900, delayMs: 3, timeout: false }),
  TIMEOUT: Object.freeze({ id: 'TIMEOUT', estimatedMs: 30000, delayMs: 0, timeout: true }),
});

export function resolveMockLatency(profile = 'NORMAL') {
  const normalized = typeof profile === 'string' ? profile.trim().toUpperCase() : 'NORMAL';
  return MOCK_LATENCY_PROFILES[normalized] ?? MOCK_LATENCY_PROFILES.NORMAL;
}

export async function applyMockLatency(profile = 'NORMAL') {
  const latency = resolveMockLatency(profile);
  if (latency.delayMs > 0) {
    await new Promise((resolve) => { setTimeout(resolve, latency.delayMs); });
  }
  return latency;
}
