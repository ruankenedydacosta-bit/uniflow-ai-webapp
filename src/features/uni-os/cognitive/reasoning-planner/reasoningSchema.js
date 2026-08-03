import { CAPABILITY_IDS } from '../../llm/capability-registry/capabilitySchema.js';
import { CONFIDENCE_TARGETS, REASONING_DEPTHS } from './reasoningDepth.js';
import {
  AMBIGUITY_LEVELS,
  ANALYSIS_MODES,
  CONVERSATION_MODES,
  DECISION_STRATEGIES,
  PRIORITY_FOCUS,
  RESPONSE_STRATEGIES,
  RISK_LEVELS,
} from './reasoningStrategies.js';

export const REASONING_PLANNER_VERSION = '1.0';

export const REASONING_SECTION_NAMES = Object.freeze({
  context: Object.freeze(['conversation', 'context', 'security', 'permissions']),
  memory: Object.freeze(['memory']),
  insights: Object.freeze(['insights']),
  goals: Object.freeze(['goals']),
});

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

function safeList(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => allowed.includes(item)))];
}

function safeTimestamp(value) {
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function createReasoningPlanSnapshot(draft = {}) {
  const source = deepClone(draft && typeof draft === 'object' ? draft : {});
  const reasoningDepth = safeEnum(source.reasoningDepth, REASONING_DEPTHS, 'LOW');
  return deepFreeze({
    intent: typeof source.intent === 'string' && source.intent.trim()
      ? source.intent.trim().toLowerCase()
      : 'question',
    reasoningDepth,
    analysisMode: safeEnum(source.analysisMode, ANALYSIS_MODES, 'CASUAL'),
    decisionStrategy: safeEnum(source.decisionStrategy, DECISION_STRATEGIES, 'DIRECT'),
    responseStrategy: safeEnum(source.responseStrategy, RESPONSE_STRATEGIES, 'CONCISE'),
    conversationMode: safeEnum(source.conversationMode, CONVERSATION_MODES, 'CASUAL'),
    confidenceTarget: Number.isFinite(source.confidenceTarget)
      ? Math.min(1, Math.max(0, source.confidenceTarget))
      : CONFIDENCE_TARGETS[reasoningDepth],
    priorityFocus: safeEnum(source.priorityFocus, PRIORITY_FOCUS, 'USER_INTENT'),
    requiredCapabilities: safeList(source.requiredCapabilities, CAPABILITY_IDS),
    requiredContextSections: safeList(
      source.requiredContextSections,
      REASONING_SECTION_NAMES.context,
    ),
    requiredMemorySections: safeList(
      source.requiredMemorySections,
      REASONING_SECTION_NAMES.memory,
    ),
    requiredInsightSections: safeList(
      source.requiredInsightSections,
      REASONING_SECTION_NAMES.insights,
    ),
    requiredGoalSections: safeList(source.requiredGoalSections, REASONING_SECTION_NAMES.goals),
    riskLevel: safeEnum(source.riskLevel, RISK_LEVELS, 'LOW'),
    ambiguityLevel: safeEnum(source.ambiguityLevel, AMBIGUITY_LEVELS, 'NONE'),
    followUpRequired: source.followUpRequired === true,
    plannerVersion: REASONING_PLANNER_VERSION,
    generatedAt: safeTimestamp(source.generatedAt),
    executionAllowed: false,
    metadata: {
      deterministic: true,
      shadowOnly: true,
      promptGenerated: false,
      modelInvoked: false,
      externalCallsMade: false,
      contextModified: false,
      persisted: false,
    },
  });
}
