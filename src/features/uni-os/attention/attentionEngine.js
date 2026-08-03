export const ATTENTION_TYPES = Object.freeze([
  'financial_action',
  'financial_question',
  'casual',
  'explanation',
  'emergency',
  'planning',
  'configuration',
]);

const FINANCIAL_ACTIONS = new Set(['register_income', 'register_expense', 'register_transfer', 'create_goal']);
const FINANCIAL_QUESTIONS = new Set(['check_balance', 'forecast', 'financial_question']);

export function classifyAttention(processedIntent = {}) {
  const intent = processedIntent && typeof processedIntent === 'object' ? processedIntent : {};
  if (ATTENTION_TYPES.includes(intent.attentionType)) return intent.attentionType;
  if (intent.emergency === true || intent.priority === 'emergency') return 'emergency';
  const name = intent.intent ?? intent.type ?? 'question';
  if (FINANCIAL_ACTIONS.has(name)) return 'financial_action';
  if (FINANCIAL_QUESTIONS.has(name)) return 'financial_question';
  if (name === 'explanation') return 'explanation';
  if (name === 'planning' || name === 'create_plan') return 'planning';
  if (name === 'configuration' || name === 'update_preference') return 'configuration';
  return name === 'casual' ? 'casual' : 'explanation';
}

export function createAttentionResult(processedIntent) {
  return Object.freeze({
    type: classifyAttention(processedIntent),
    source: 'processed_intent',
    executesAction: false,
  });
}
