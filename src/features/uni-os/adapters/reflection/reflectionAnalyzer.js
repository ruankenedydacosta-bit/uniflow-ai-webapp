const FINANCIAL_TRANSACTIONS = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
]);
const CATEGORY_ACTIONS = new Set(['register_income', 'register_expense']);

function entityList(parsedIntent, name) {
  const value = parsedIntent?.entities?.[name];
  return Array.isArray(value) ? value : [];
}

function issue(code, field, severity = 'MEDIUM') {
  return { code, field, severity };
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function analyzeRequiredEntities(parsedIntent, inconsistencies, recommendations) {
  const intent = parsedIntent?.intent;
  if (!FINANCIAL_TRANSACTIONS.has(intent)) return;

  const required = [
    ['accounts', 'account', 'MISSING_ACCOUNT', 'REQUEST_ACCOUNT'],
    ['values', 'amount', 'MISSING_AMOUNT', 'REQUEST_AMOUNT'],
    ['dates', 'date', 'MISSING_DATE', 'REQUEST_DATE'],
  ];
  if (CATEGORY_ACTIONS.has(intent)) {
    required.push(['categories', 'category', 'MISSING_CATEGORY', 'REQUEST_CATEGORY']);
  }

  required.forEach(([entity, field, code, recommendation]) => {
    if (entityList(parsedIntent, entity).length) return;
    inconsistencies.push(issue(code, field));
    addUnique(recommendations, recommendation);
  });
}

function analyzeAmbiguity(parsedIntent, inconsistencies, recommendations) {
  let ambiguityDetected = false;
  [['accounts', 'account'], ['categories', 'category']].forEach(([entity, field]) => {
    if (entityList(parsedIntent, entity).length <= 1) return;
    ambiguityDetected = true;
    inconsistencies.push(issue(`MULTIPLE_${entity.toUpperCase()}`, field, 'HIGH'));
  });
  if (ambiguityDetected) addUnique(recommendations, 'REQUEST_DISAMBIGUATION');
  return ambiguityDetected;
}

function analyzeContext(parsedIntent, contextSnapshot, inconsistencies, recommendations) {
  const requested = entityList(parsedIntent, 'workspaces')
    .map((item) => item?.id)
    .filter(Boolean);
  const current = contextSnapshot?.workspace?.id ?? null;
  if (requested.length > 1 || (requested.length === 1 && current && requested[0] !== current)) {
    inconsistencies.push(issue('CONTEXT_WORKSPACE_CONFLICT', 'workspace', 'HIGH'));
    addUnique(recommendations, 'REQUEST_DISAMBIGUATION');
    return true;
  }
  return false;
}

function analyzePlan(parsedIntent, planningSnapshot, inconsistencies) {
  const steps = Array.isArray(planningSnapshot?.steps) ? planningSnapshot.steps : [];
  if (!steps.length) inconsistencies.push(issue('EMPTY_PLAN', 'steps', 'HIGH'));
  if (planningSnapshot?.intent && planningSnapshot.intent !== (parsedIntent?.intent ?? 'question')) {
    inconsistencies.push(issue('PLAN_INTENT_MISMATCH', 'intent', 'HIGH'));
  }
  if (planningSnapshot?.executionAllowed !== false) {
    inconsistencies.push(issue('EXECUTION_NOT_BLOCKED', 'executionAllowed', 'HIGH'));
  }
}

function calculateConfidence(parsedIntent, planningSnapshot, inconsistencies) {
  const source = Number.isFinite(planningSnapshot?.confidence)
    ? planningSnapshot.confidence
    : parsedIntent?.confidence;
  const base = Number.isFinite(source) ? Math.min(1, Math.max(0, source)) : 0;
  const penalty = inconsistencies.reduce(
    (total, item) => total + (item.severity === 'HIGH' ? 0.2 : 0.1),
    0,
  );
  return Math.max(0, Number((base - Math.min(0.6, penalty)).toFixed(2)));
}

function calculateRisk(inconsistencies, lowConfidence) {
  if (inconsistencies.some((item) => item.severity === 'HIGH')) return 'HIGH';
  if (inconsistencies.length || lowConfidence) return 'MEDIUM';
  return 'LOW';
}

export function analyzePlanningSnapshot({
  parsedIntent = {},
  contextSnapshot = {},
  memorySnapshot = {},
  planningSnapshot = {},
} = {}) {
  void memorySnapshot;
  const inconsistencies = [];
  const recommendations = [];
  const ambiguousEntities = analyzeAmbiguity(parsedIntent, inconsistencies, recommendations);
  const contextConflict = analyzeContext(
    parsedIntent,
    contextSnapshot,
    inconsistencies,
    recommendations,
  );
  analyzeRequiredEntities(parsedIntent, inconsistencies, recommendations);
  analyzePlan(parsedIntent, planningSnapshot, inconsistencies);

  const confirmationRequired = planningSnapshot?.requiresConfirmation === true;
  if (confirmationRequired) addUnique(recommendations, 'ASK_CONFIRMATION');
  const confidence = calculateConfidence(parsedIntent, planningSnapshot, inconsistencies);
  const lowConfidence = confidence < 0.5;
  if (lowConfidence) {
    inconsistencies.push(issue('LOW_CONFIDENCE', 'confidence'));
    addUnique(recommendations, 'REQUEST_DISAMBIGUATION');
  }
  if (confirmationRequired && inconsistencies.length === 0) {
    addUnique(recommendations, 'PROCEED_AFTER_CONFIRMATION');
  }

  return {
    overallRisk: calculateRisk(inconsistencies, lowConfidence),
    confidence,
    confirmationRequired,
    ambiguityDetected: ambiguousEntities || contextConflict,
    inconsistencies,
    recommendations,
  };
}
