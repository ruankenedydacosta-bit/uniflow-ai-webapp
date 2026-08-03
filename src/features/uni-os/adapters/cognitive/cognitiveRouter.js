export const COGNITIVE_CAPABILITIES = Object.freeze([
  'GENERAL_REASONING',
  'FINANCIAL_REASONING',
  'PLANNING',
  'SUMMARIZATION',
  'CLASSIFICATION',
  'CONVERSATION',
]);

const FINANCIAL_INTENTS = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
  'check_balance',
  'forecast',
  'financial_question',
]);

export function classifyFutureCapability(parsedIntent = {}) {
  const intent = parsedIntent?.intent ?? 'question';
  if (FINANCIAL_INTENTS.has(intent)) return 'FINANCIAL_REASONING';
  if (intent === 'planning' || intent === 'create_plan') return 'PLANNING';
  if (intent === 'summarization' || intent === 'summarize') return 'SUMMARIZATION';
  if (intent === 'classification' || intent === 'classify') return 'CLASSIFICATION';
  if (intent === 'casual' || intent === 'conversation') return 'CONVERSATION';
  return 'GENERAL_REASONING';
}

export function routeCognitiveRequest(parsedIntent = {}) {
  return Object.freeze({
    requestedCapability: classifyFutureCapability(parsedIntent),
    route: 'NOT_IMPLEMENTED',
    provider: null,
    shouldInvokeModel: false,
    modelCapability: null,
    promptTemplate: null,
  });
}
