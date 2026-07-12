import { deepFreeze, isValidMemoryType, MEMORY_SOURCES } from './memoryTypes.js';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function valuesMatch(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function isExpired(memory, now) {
  return Boolean(memory?.expiresAt && new Date(memory.expiresAt) <= new Date(now));
}

function sourcePriority(source) {
  if (source === MEMORY_SOURCES.EXPLICIT_USER) return 3;
  if (source === MEMORY_SOURCES.USER_CORRECTION) return 2;
  return 1;
}

export function resolveMemoryCandidate(candidate, existingMemories = [], {
  now = new Date().toISOString(),
} = {}) {
  if (!candidate || !isValidMemoryType(candidate.type) || !candidate.key) {
    return deepFreeze({ decision: 'insufficient', memory: null, requiresReview: false });
  }
  if (isExpired(candidate, now)) {
    return deepFreeze({ decision: 'expired', memory: { ...candidate, status: 'expired' }, requiresReview: false });
  }

  const matches = existingMemories.filter((memory) =>
    memory.type === candidate.type && memory.key === candidate.key && memory.status !== 'rejected',
  );
  const existing = matches.sort((left, right) =>
    String(right.lastObservedAt ?? '').localeCompare(String(left.lastObservedAt ?? '')),
  )[0];
  if (!existing) {
    return deepFreeze({ decision: 'accept_candidate', memory: { ...candidate, status: 'candidate' }, requiresReview: candidate.requiresConfirmation });
  }
  if (isExpired(existing, now)) {
    return deepFreeze({ decision: 'replace_expired', memory: { ...candidate, status: 'candidate' }, previous: existing, requiresReview: candidate.requiresConfirmation });
  }
  if (valuesMatch(existing.value, candidate.value)) {
    const status = existing.status === 'confirmed' ? 'confirmed' : 'candidate';
    return deepFreeze({
      decision: status === 'confirmed' ? 'keep_confirmed' : 'refresh_candidate',
      memory: {
        ...existing,
        confidence: Math.max(existing.confidence ?? 0, candidate.confidence ?? 0),
        lastObservedAt: candidate.lastObservedAt ?? existing.lastObservedAt,
        status,
      },
      requiresReview: false,
    });
  }
  if (existing.status === 'confirmed') {
    return deepFreeze({ decision: 'review_required', memory: existing, candidate, requiresReview: true });
  }
  if (sourcePriority(candidate.source) > sourcePriority(existing.source)) {
    return deepFreeze({ decision: 'prefer_explicit', memory: { ...candidate, status: 'candidate' }, previous: existing, requiresReview: candidate.requiresConfirmation });
  }
  if (sourcePriority(existing.source) > sourcePriority(candidate.source)) {
    return deepFreeze({ decision: 'keep_explicit', memory: existing, candidate, requiresReview: false });
  }
  return deepFreeze({ decision: 'review_required', memory: existing, candidate, requiresReview: true });
}
