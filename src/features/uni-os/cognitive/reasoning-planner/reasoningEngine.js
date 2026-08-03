import { confidenceTargetForDepth, resolveReasoningDepth } from './reasoningDepth.js';
import {
  normalizeIntent,
  resolveAnalysisMode,
  resolveStrategies,
} from './reasoningStrategies.js';

const CAPABILITIES_BY_MODE = Object.freeze({
  CASUAL: ['CONVERSATION'],
  TRANSACTIONAL: ['FINANCIAL_REASONING', 'CLASSIFICATION'],
  ANALYTICAL: ['FINANCIAL_REASONING', 'EXPLANATION'],
  PLANNING: ['LONG_TERM_PLANNING', 'GOAL_ANALYSIS', 'RECOMMENDATION'],
  CONFIGURATION: ['CLASSIFICATION', 'EXPLANATION'],
  SAFETY: ['FINANCIAL_REASONING', 'RECOMMENDATION', 'EXPLANATION'],
});

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function extractCompiledContext(input) {
  if (!isRecord(input)) return {};
  return isRecord(input.compiledContext) ? input.compiledContext : input;
}

function safeCollection(value) {
  return Array.isArray(value) ? value : [];
}

function deriveRiskLevel(context, analysisMode) {
  if (analysisMode === 'SAFETY') return 'CRITICAL';
  const reflectionRisk = context.reflection?.overallRisk;
  const securityStatus = context.security?.status;
  if (reflectionRisk === 'HIGH' || securityStatus === 'BLOCK') return 'HIGH';
  if (
    reflectionRisk === 'MEDIUM'
    || securityStatus === 'ALLOW_WITH_CONFIRMATION'
    || context.conversation?.requiresConfirmation === true
  ) return 'MEDIUM';
  return 'LOW';
}

function deriveAmbiguityLevel(context, hasIntent) {
  const conversation = isRecord(context.conversation) ? context.conversation : {};
  const reflection = isRecord(context.reflection) ? context.reflection : {};
  const inconsistencies = safeCollection(reflection.inconsistencies);
  if (reflection.ambiguityDetected === true && inconsistencies.length > 0) return 'HIGH';
  if (reflection.ambiguityDetected === true) return 'MEDIUM';
  if (hasIntent && Number.isFinite(conversation.confidence) && conversation.confidence < 0.5) {
    return 'HIGH';
  }
  if (hasIntent && Number.isFinite(conversation.confidence) && conversation.confidence < 0.75) {
    return 'MEDIUM';
  }
  if (conversation.requiresConfirmation === true) return 'LOW';
  return 'NONE';
}

function requiredCapabilities(context, analysisMode, intent) {
  const values = [...(CAPABILITIES_BY_MODE[analysisMode] ?? CAPABILITIES_BY_MODE.CASUAL)];
  if (intent === 'forecast') values.push('FORECAST');
  if (safeCollection(context.insights).some((item) => item?.type !== 'NO_INSIGHT')) {
    values.push('INSIGHT_ANALYSIS');
  }
  return [...new Set(values)];
}

function requiredSections(context, analysisMode) {
  return {
    requiredContextSections: [
      'conversation',
      ...(safeCollection(context.context).length > 0 ? ['context'] : []),
      'security',
      'permissions',
    ],
    requiredMemorySections: safeCollection(context.memory).length > 0 ? ['memory'] : [],
    requiredInsightSections: safeCollection(context.insights).some(
      (item) => item?.type !== 'NO_INSIGHT',
    ) ? ['insights'] : [],
    requiredGoalSections: (
      analysisMode === 'PLANNING' || safeCollection(context.goals).length > 0
    ) ? ['goals'] : [],
  };
}

export function buildReasoningPlanDraft(input = {}, options = {}) {
  const context = extractCompiledContext(input);
  const rawIntent = context.conversation?.intent;
  const hasIntent = typeof rawIntent === 'string' && Boolean(rawIntent.trim());
  const intent = normalizeIntent(rawIntent);
  const analysisMode = resolveAnalysisMode(intent);
  const riskLevel = deriveRiskLevel(context, analysisMode);
  const ambiguityLevel = deriveAmbiguityLevel(context, hasIntent);
  const reasoningDepth = resolveReasoningDepth({ analysisMode, riskLevel, ambiguityLevel });
  const strategies = resolveStrategies({
    analysisMode,
    requiresConfirmation: context.conversation?.requiresConfirmation === true,
    ambiguityLevel,
  });

  return {
    intent,
    reasoningDepth,
    analysisMode,
    ...strategies,
    confidenceTarget: confidenceTargetForDepth(reasoningDepth),
    requiredCapabilities: requiredCapabilities(context, analysisMode, intent),
    ...requiredSections(context, analysisMode),
    riskLevel,
    ambiguityLevel,
    followUpRequired: ambiguityLevel !== 'NONE'
      || context.conversation?.requiresConfirmation === true,
    generatedAt: options.now,
  };
}

export { extractCompiledContext };
