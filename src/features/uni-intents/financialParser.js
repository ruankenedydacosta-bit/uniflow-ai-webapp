import { resolveCategory } from './categoryResolver.js';
import {
  advanceConversationContext,
  applyConversationContext,
  createConversationContext,
} from './conversationContext.js';
import { extractEntities } from './entityExtractor.js';
import {
  classifyIntent,
  normalizeFinancialText,
  stripLeadingConversationalPrefix,
} from './intentClassifier.js';

const WRITE_INTENTS = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
  'set_balance',
]);

const REQUIRED_ENTITIES = {
  register_income: ['amount'],
  register_expense: ['amount'],
  register_transfer: ['amount', 'account'],
  create_goal: ['amount', 'description'],
  set_balance: ['amount'],
  check_balance: [],
  forecast: [],
  question: [],
};

function getMissingEntities(intent, entities) {
  return (REQUIRED_ENTITIES[intent] ?? []).filter(
    (field) => entities[field] === null || entities[field] === '',
  );
}

export function parseFinancialText(input, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const context = safeOptions.context ?? null;
  const referenceDate = safeOptions.referenceDate ?? null;
  const text = typeof input === 'string' ? input.trim() : '';
  const analysisText = stripLeadingConversationalPrefix(text) || text;
  const classification = classifyIntent(analysisText);
  const extractedEntities = extractEntities(analysisText, {
    intent: classification.intent,
    referenceDate,
    lookAhead: safeOptions.lookAhead === true,
  });
  const categoryResult = resolveCategory(analysisText, classification.intent);
  const draft = {
    version: '1.0',
    input: text,
    normalizedInput: normalizeFinancialText(text),
    intent: classification.intent,
    confidence: classification.confidence,
    entities: {
      ...extractedEntities,
      category: categoryResult.category,
    },
  };
  const contextualResult = applyConversationContext(draft, context);
  const missingEntities = getMissingEntities(
    contextualResult.intent,
    contextualResult.entities,
  );
  const errors = text ? [] : ['EMPTY_INPUT'];
  const result = {
    ...contextualResult,
    missingEntities,
    ready: errors.length === 0 && missingEntities.length === 0,
    requiresConfirmation: WRITE_INTENTS.has(contextualResult.intent),
    errors,
  };

  return {
    ...result,
    nextContext: advanceConversationContext(context, result),
  };
}

export function parseFinancialConversation(inputs, options = {}) {
  const messages = Array.isArray(inputs) ? inputs : [];
  const safeOptions = options && typeof options === 'object' ? options : {};
  let context = createConversationContext(safeOptions.context);
  const results = messages.map((message) => {
    const result = parseFinancialText(message, {
      context,
      referenceDate: safeOptions.referenceDate,
    });
    context = result.nextContext;
    return result;
  });

  return { results, context };
}
