import {
  communicationObjectiveForType,
  executionIntentForType,
  explanationLevelForDepth,
  fallbackForDecision,
  primaryDecisionForType,
  resolveDecisionType,
} from './decisionPolicies.js';
import { resolveDecisionStrategy } from './decisionStrategies.js';

const RISK_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const AMBIGUITY_LEVELS = new Set(['NONE', 'LOW', 'MEDIUM', 'HIGH']);

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function normalizeInput(input) {
  const source = isRecord(input) ? input : {};
  const reasoningPlan = isRecord(source.reasoningPlan) ? source.reasoningPlan : null;
  const contextSource = isRecord(source.compiledContext) ? source.compiledContext : {};
  const compiledContext = isRecord(contextSource.compiledContext)
    ? contextSource.compiledContext
    : contextSource;
  return { reasoningPlan, compiledContext };
}

function safeCollection(value) {
  return Array.isArray(value) ? value : [];
}

function includesSection(plan, field, section) {
  return Array.isArray(plan?.[field]) && plan[field].includes(section);
}

function selectContext(context, plan) {
  const selected = {};
  safeCollection(plan?.requiredContextSections).forEach((section) => {
    if (Object.hasOwn(context, section)) selected[section] = context[section];
  });
  return selected;
}

function selectedReasoning(plan) {
  if (!plan) return {};
  return {
    intent: plan.intent,
    reasoningDepth: plan.reasoningDepth,
    analysisMode: plan.analysisMode,
    decisionStrategy: plan.decisionStrategy,
    responseStrategy: plan.responseStrategy,
    confidenceTarget: plan.confidenceTarget,
    priorityFocus: plan.priorityFocus,
  };
}

function assessRisk(plan) {
  const level = RISK_LEVELS.has(plan?.riskLevel) ? plan.riskLevel : 'LOW';
  return {
    level,
    blocking: ['HIGH', 'CRITICAL'].includes(level),
    reasons: level === 'LOW' ? [] : [`RISK_${level}`],
  };
}

function assessAmbiguity(plan, hasPlanner) {
  const level = hasPlanner && AMBIGUITY_LEVELS.has(plan?.ambiguityLevel)
    ? plan.ambiguityLevel
    : 'HIGH';
  return {
    level,
    detected: level !== 'NONE',
    clarificationRequired: ['MEDIUM', 'HIGH'].includes(level),
  };
}

function calculateConfidence(plan, risk, ambiguity, hasPlanner) {
  if (!hasPlanner) return 0;
  const base = Number.isFinite(plan.confidenceTarget) ? plan.confidenceTarget : 0.5;
  const ambiguityPenalty = { NONE: 0, LOW: 0.05, MEDIUM: 0.15, HIGH: 0.3 }[ambiguity.level];
  const riskPenalty = { LOW: 0, MEDIUM: 0, HIGH: 0.05, CRITICAL: 0.1 }[risk.level];
  return Math.round(Math.max(0, Math.min(1, base - ambiguityPenalty - riskPenalty)) * 100) / 100;
}

export function evaluateDecision(input = {}, options = {}) {
  const { reasoningPlan, compiledContext } = normalizeInput(input);
  const hasPlanner = Boolean(reasoningPlan?.plannerVersion && reasoningPlan.executionAllowed === false);
  const riskAssessment = assessRisk(reasoningPlan);
  const ambiguityAssessment = assessAmbiguity(reasoningPlan, hasPlanner);
  const decisionType = resolveDecisionType(reasoningPlan ?? {}, hasPlanner);
  const confirmationRequired = decisionType === 'FINANCIAL_ACTION_CONFIRMATION'
    || decisionType === 'CLARIFICATION_REQUEST'
    || reasoningPlan?.followUpRequired === true;

  return {
    primaryDecision: primaryDecisionForType(decisionType),
    decisionType,
    decisionConfidence: calculateConfidence(
      reasoningPlan ?? {}, riskAssessment, ambiguityAssessment, hasPlanner,
    ),
    selectedStrategy: resolveDecisionStrategy(decisionType),
    selectedReasoning: selectedReasoning(reasoningPlan),
    selectedInsights: includesSection(reasoningPlan, 'requiredInsightSections', 'insights')
      ? safeCollection(compiledContext.insights) : [],
    selectedGoals: includesSection(reasoningPlan, 'requiredGoalSections', 'goals')
      ? safeCollection(compiledContext.goals) : [],
    selectedContext: selectContext(compiledContext, reasoningPlan),
    selectedMemory: includesSection(reasoningPlan, 'requiredMemorySections', 'memory')
      ? safeCollection(compiledContext.memory) : [],
    recommendedCapabilities: safeCollection(reasoningPlan?.requiredCapabilities),
    executionIntent: executionIntentForType(decisionType),
    confirmationRequired,
    riskAssessment,
    ambiguityAssessment,
    fallbackStrategy: fallbackForDecision({ decisionType, riskLevel: riskAssessment.level }),
    explanationLevel: explanationLevelForDepth(reasoningPlan?.reasoningDepth),
    communicationObjective: communicationObjectiveForType(decisionType),
    plannerReference: {
      version: reasoningPlan?.plannerVersion ?? null,
      generatedAt: reasoningPlan?.generatedAt ?? null,
      intent: reasoningPlan?.intent ?? null,
    },
    generatedAt: options.now,
  };
}

export { normalizeInput };
