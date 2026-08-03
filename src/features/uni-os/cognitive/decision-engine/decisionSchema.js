import { CAPABILITY_IDS } from '../../llm/capability-registry/capabilitySchema.js';
import {
  COMMUNICATION_OBJECTIVES,
  DECISION_TYPES,
  EXECUTION_INTENTS,
  EXPLANATION_LEVELS,
  FALLBACK_STRATEGIES,
  PRIMARY_DECISIONS,
} from './decisionPolicies.js';
import { DECISION_STRATEGIES } from './decisionStrategies.js';

export const DECISION_ENGINE_VERSION = '1.0';
export const DECISION_RISK_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const DECISION_AMBIGUITY_LEVELS = Object.freeze(['NONE', 'LOW', 'MEDIUM', 'HIGH']);

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

function safeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function safeCollection(value) {
  return Array.isArray(value) ? value.map((item) => deepClone(item)) : [];
}

function safeRecord(value) {
  return value && !Array.isArray(value) && typeof value === 'object' ? deepClone(value) : {};
}

function safeCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => CAPABILITY_IDS.includes(item)))];
}

function safeTimestamp(value) {
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function createDecisionPlanSnapshot(draft = {}) {
  const source = deepClone(draft && typeof draft === 'object' ? draft : {});
  const decisionType = safeEnum(source.decisionType, DECISION_TYPES, 'CLARIFICATION_REQUEST');
  const risk = safeRecord(source.riskAssessment);
  const ambiguity = safeRecord(source.ambiguityAssessment);
  return deepFreeze({
    primaryDecision: safeEnum(
      source.primaryDecision, PRIMARY_DECISIONS, 'REQUEST_CLARIFICATION',
    ),
    decisionType,
    decisionConfidence: Number.isFinite(source.decisionConfidence)
      ? Math.min(1, Math.max(0, source.decisionConfidence)) : 0,
    selectedStrategy: safeEnum(source.selectedStrategy, DECISION_STRATEGIES, 'CLARIFY_FIRST'),
    selectedReasoning: safeRecord(source.selectedReasoning),
    selectedInsights: safeCollection(source.selectedInsights),
    selectedGoals: safeCollection(source.selectedGoals),
    selectedContext: safeRecord(source.selectedContext),
    selectedMemory: safeCollection(source.selectedMemory),
    recommendedCapabilities: safeCapabilities(source.recommendedCapabilities),
    executionIntent: safeEnum(source.executionIntent, EXECUTION_INTENTS, 'NONE'),
    confirmationRequired: source.confirmationRequired === true,
    riskAssessment: {
      level: safeEnum(risk.level, DECISION_RISK_LEVELS, 'LOW'),
      blocking: risk.blocking === true,
      reasons: Array.isArray(risk.reasons)
        ? [...new Set(risk.reasons.filter((item) => typeof item === 'string'))] : [],
    },
    ambiguityAssessment: {
      level: safeEnum(ambiguity.level, DECISION_AMBIGUITY_LEVELS, 'HIGH'),
      detected: ambiguity.detected !== false,
      clarificationRequired: ambiguity.clarificationRequired !== false,
    },
    fallbackStrategy: safeEnum(
      source.fallbackStrategy, FALLBACK_STRATEGIES, 'REQUEST_CLARIFICATION',
    ),
    explanationLevel: safeEnum(source.explanationLevel, EXPLANATION_LEVELS, 'MINIMAL'),
    communicationObjective: safeEnum(
      source.communicationObjective, COMMUNICATION_OBJECTIVES, 'CLARIFY',
    ),
    plannerReference: safeRecord(source.plannerReference),
    engineVersion: DECISION_ENGINE_VERSION,
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
      persisted: false,
    },
  });
}
