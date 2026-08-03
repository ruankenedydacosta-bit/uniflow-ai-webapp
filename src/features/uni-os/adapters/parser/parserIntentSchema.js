export const PARSED_INTENT_SCHEMA_VERSION = '1.0';
export const PARSED_INTENT_SOURCES = Object.freeze(['text', 'voice', 'system']);

const ACTION_TYPES = Object.freeze({
  register_income: 'income',
  register_expense: 'expense',
  register_transfer: 'transfer',
  create_goal: 'goal',
});
const VALID_ACTION_TYPES = new Set(Object.values(ACTION_TYPES));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function safeConfidence(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function resolveParserActionType(intent) {
  return ACTION_TYPES[intent] ?? null;
}

export function createParsedIntent(input = {}) {
  const source = PARSED_INTENT_SOURCES.includes(input.source) ? input.source : 'text';
  const copyEntities = (values) => Array.isArray(values)
    ? values.map((value) => (value && typeof value === 'object' ? { ...value } : value))
    : [];
  const actionType = VALID_ACTION_TYPES.has(input.actionType)
    ? input.actionType
    : resolveParserActionType(input.intent);
  return deepFreeze({
    id: typeof input.id === 'string' ? input.id : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    source,
    language: typeof input.language === 'string' ? input.language : 'pt-BR',
    intent: typeof input.intent === 'string' ? input.intent : 'question',
    confidence: safeConfidence(input.confidence),
    entities: {
      accounts: copyEntities(input.entities?.accounts),
      categories: copyEntities(input.entities?.categories),
      merchants: copyEntities(input.entities?.merchants),
      values: copyEntities(input.entities?.values),
      dates: copyEntities(input.entities?.dates),
      workspaces: copyEntities(input.entities?.workspaces),
    },
    requiresConfirmation: input.requiresConfirmation === true,
    actionType,
    metadata: {
      schemaVersion: PARSED_INTENT_SCHEMA_VERSION,
      parserVersion: input.metadata?.parserVersion ?? null,
      ready: input.metadata?.ready === true,
      missingEntities: Array.isArray(input.metadata?.missingEntities)
        ? [...input.metadata.missingEntities]
        : [],
      errorCodes: Array.isArray(input.metadata?.errorCodes)
        ? [...input.metadata.errorCodes]
        : [],
    },
  });
}

export function isParsedIntent(value) {
  return Boolean(
    value
    && typeof value.id === 'string'
    && typeof value.timestamp === 'string'
    && PARSED_INTENT_SOURCES.includes(value.source)
    && typeof value.intent === 'string'
    && value.entities
    && Array.isArray(value.entities.accounts)
    && Array.isArray(value.entities.categories)
    && Array.isArray(value.entities.values)
    && Array.isArray(value.entities.dates),
  );
}
