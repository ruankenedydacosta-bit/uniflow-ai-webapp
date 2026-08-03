import { CONFIDENCE_LEVELS } from './confidenceLevels.js';
import {
  CONFIDENCE_REASONS,
  CONFLICTING_SIGNAL_CODES,
  MISSING_INFORMATION_CODES,
  RECOMMENDED_FOLLOW_UPS,
  UNCERTAINTY_SOURCE_CODES,
} from './confidencePolicies.js';

export const CONFIDENCE_ENGINE_VERSION = '1.0';

export function deepClone(value, seen = new WeakMap()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value);
    const clone = [];
    seen.set(value, clone);
    value.forEach((item) => clone.push(deepClone(item, seen)));
    return clone;
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const clone = {};
  seen.set(value, clone);
  Object.entries(value).forEach(([key, nested]) => {
    clone[key] = deepClone(nested, seen);
  });
  return clone;
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}

function safeList(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => allowed.includes(item)))];
}

function safeTimestamp(value) {
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function createConfidencePlanSnapshot(draft = {}) {
  const source = deepClone(draft && typeof draft === 'object' ? draft : {});
  return deepFreeze({
    confidenceScore: Number.isFinite(source.confidenceScore)
      ? Math.min(1, Math.max(0, source.confidenceScore)) : 0,
    confidenceLevel: CONFIDENCE_LEVELS.includes(source.confidenceLevel)
      ? source.confidenceLevel : 'VERY_LOW',
    confidenceReasons: safeList(source.confidenceReasons, CONFIDENCE_REASONS),
    missingInformation: safeList(source.missingInformation, MISSING_INFORMATION_CODES),
    conflictingSignals: safeList(source.conflictingSignals, CONFLICTING_SIGNAL_CODES),
    uncertaintySources: safeList(source.uncertaintySources, UNCERTAINTY_SOURCE_CODES),
    requiresConfirmation: source.requiresConfirmation !== false,
    safeToRecommend: source.safeToRecommend === true,
    safeToExecute: false,
    recommendedFollowUp: RECOMMENDED_FOLLOW_UPS.includes(source.recommendedFollowUp)
      ? source.recommendedFollowUp : 'REQUEST_MISSING_INFORMATION',
    confidenceVersion: CONFIDENCE_ENGINE_VERSION,
    generatedAt: safeTimestamp(source.generatedAt),
    executionAllowed: false,
    metadata: {
      deterministic: true,
      providerAgnostic: true,
      shadowOnly: true,
      promptGenerated: false,
      modelInvoked: false,
      externalCallsMade: false,
      actionExecuted: false,
      contextModified: false,
      decisionModified: false,
      persisted: false,
    },
  });
}
