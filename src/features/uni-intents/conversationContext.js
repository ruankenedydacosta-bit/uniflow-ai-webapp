import { normalizeFinancialText } from './intentClassifier.js';

const CONTEXTUAL_INTENTS = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'set_balance',
]);
const INHERITABLE_ENTITIES = ['category', 'description', 'account', 'date'];
const MAX_TURNS = 10;

function safeEntities(entities = {}) {
  return {
    amount: entities.amount ?? null,
    category: entities.category ?? null,
    description: entities.description ?? null,
    account: entities.account ?? null,
    date: entities.date ?? null,
  };
}

export function createConversationContext(seed = {}) {
  const safeSeed = seed && typeof seed === 'object' ? seed : {};
  const turns = Array.isArray(safeSeed.turns)
    ? safeSeed.turns.slice(-MAX_TURNS).map((turn) => ({
        intent: turn.intent ?? 'question',
        entities: safeEntities(turn.entities),
      }))
    : [];

  return {
    version: 1,
    lastIntent: safeSeed.lastIntent ?? null,
    lastEntities: safeEntities(safeSeed.lastEntities),
    turns,
  };
}

export function isContextContinuation(input) {
  return /^(?:e\s+)?mais\b|^tambem\b|^outro?s?\b|^outra?s?\b/.test(
    normalizeFinancialText(input),
  );
}

export function applyConversationContext(draft, contextInput) {
  const context = createConversationContext(contextInput);
  const canInherit =
    isContextContinuation(draft.input) &&
    draft.entities.amount !== null &&
    CONTEXTUAL_INTENTS.has(context.lastIntent);

  if (!canInherit) {
    return {
      ...draft,
      context: {
        usedPreviousTurn: false,
        inheritedEntities: [],
        previousIntent: context.lastIntent,
        turnCount: context.turns.length,
      },
    };
  }

  const entities = { ...draft.entities };
  const inheritedEntities = [];

  INHERITABLE_ENTITIES.forEach((field) => {
    const previousValue = context.lastEntities[field];
    const shouldReplace = field === 'description' || entities[field] === null;

    if (shouldReplace && previousValue !== null) {
      entities[field] = previousValue;
      inheritedEntities.push(field);
    }
  });

  return {
    ...draft,
    intent: context.lastIntent,
    confidence: Math.max(draft.confidence, 0.88),
    entities,
    context: {
      usedPreviousTurn: true,
      inheritedEntities,
      previousIntent: context.lastIntent,
      turnCount: context.turns.length,
    },
  };
}

export function advanceConversationContext(contextInput, parsedResult) {
  const context = createConversationContext(contextInput);
  const turn = {
    intent: parsedResult.intent,
    entities: safeEntities(parsedResult.entities),
  };

  return {
    version: 1,
    lastIntent: turn.intent,
    lastEntities: turn.entities,
    turns: [...context.turns, turn].slice(-MAX_TURNS),
  };
}
