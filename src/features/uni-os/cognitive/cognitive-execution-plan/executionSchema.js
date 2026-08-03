import { CAPABILITY_IDS } from '../../llm/capability-registry/capabilitySchema.js';
import { EXECUTION_CONFLICT_CODES, REQUIRED_PLAN_NAMES } from './executionAggregator.js';
import {
  CEP_COMMUNICATION_OBJECTIVES,
  EFFECTIVE_REASONING_DEPTHS,
  EFFECTIVE_RISK_LEVELS,
  EFFECTIVE_STRATEGIES,
  FOLLOW_UP_STRATEGIES,
} from './executionPolicies.js';

export const COGNITIVE_EXECUTION_PLAN_VERSION = '1.0';

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

function safeRecord(value) {
  return value && !Array.isArray(value) && typeof value === 'object' ? deepClone(value) : {};
}

function safeList(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => allowed.includes(item)))];
}

function safeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function safeTimestamp(value) {
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function createCognitiveExecutionPlanSnapshot(draft = {}) {
  const source = deepClone(draft && typeof draft === 'object' ? draft : {});
  const metadata = safeRecord(source.metadata);
  return deepFreeze({
    reasoningPlan: safeRecord(source.reasoningPlan),
    decisionPlan: safeRecord(source.decisionPlan),
    confidencePlan: safeRecord(source.confidencePlan),
    effectiveStrategy: safeEnum(
      source.effectiveStrategy, EFFECTIVE_STRATEGIES, 'SAFE_FALLBACK',
    ),
    effectiveCapabilities: safeList(source.effectiveCapabilities, CAPABILITY_IDS),
    effectiveRisk: safeEnum(source.effectiveRisk, EFFECTIVE_RISK_LEVELS, 'HIGH'),
    effectiveConfidence: Number.isFinite(source.effectiveConfidence)
      ? Math.min(1, Math.max(0, source.effectiveConfidence)) : 0,
    effectiveReasoningDepth: safeEnum(
      source.effectiveReasoningDepth, EFFECTIVE_REASONING_DEPTHS, 'HIGH',
    ),
    communicationObjective: safeEnum(
      source.communicationObjective, CEP_COMMUNICATION_OBJECTIVES, 'CLARIFY',
    ),
    followUpStrategy: safeEnum(
      source.followUpStrategy, FOLLOW_UP_STRATEGIES, 'REQUEST_MISSING_PLANS',
    ),
    plannerVersion: COGNITIVE_EXECUTION_PLAN_VERSION,
    generatedAt: safeTimestamp(source.generatedAt),
    executionAllowed: false,
    metadata: {
      missingPlans: safeList(metadata.missingPlans, REQUIRED_PLAN_NAMES),
      conflicts: safeList(metadata.conflicts, EXECUTION_CONFLICT_CODES),
      sourceVersions: safeRecord(metadata.sourceVersions),
      deterministic: true,
      providerAgnostic: true,
      shadowOnly: true,
      promptGenerated: false,
      modelInvoked: false,
      externalCallsMade: false,
      actionExecuted: false,
      sourcePlansModified: false,
      persisted: false,
    },
  });
}
