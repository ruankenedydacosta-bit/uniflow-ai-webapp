import { TOKEN_BUDGET_SECTIONS } from './budgetPolicy.js';

const CHARACTERS_PER_ESTIMATED_UNIT = 4;

function estimateString(value) {
  return value.length === 0 ? 0 : Math.ceil(value.length / CHARACTERS_PER_ESTIMATED_UNIT);
}

function estimateValue(value, visited) {
  if (value == null) return 0;
  if (typeof value === 'string') return estimateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return 1;
  if (typeof value !== 'object' || visited.has(value)) return 0;
  visited.add(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return 0;
    return 1 + value.reduce((total, item) => total + estimateValue(item, visited), 0);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return 0;
  return 1 + entries.reduce(
    (total, [key, nested]) => total + estimateString(key) + estimateValue(nested, visited),
    0,
  );
}

export function estimateBudgetValue(value) {
  return estimateValue(value, new WeakSet());
}

export function resolveConversationWindow(conversationWindow = {}) {
  const source = conversationWindow && typeof conversationWindow === 'object'
    ? conversationWindow
    : {};
  const window = source.conversationWindow ?? source;
  return window && !Array.isArray(window) && typeof window === 'object' ? window : {};
}

export function estimateConversationWindow(conversationWindow = {}) {
  const source = resolveConversationWindow(conversationWindow);
  return Object.freeze(Object.fromEntries(
    TOKEN_BUDGET_SECTIONS.map((section) => [section, estimateBudgetValue(source[section])]),
  ));
}

export const BUDGET_ESTIMATOR_METADATA = Object.freeze({
  id: 'DETERMINISTIC_STRUCTURE_RATIO_V1',
  approximate: true,
  tokenizerUsed: false,
  modelConsulted: false,
  charactersPerEstimatedUnit: CHARACTERS_PER_ESTIMATED_UNIT,
});
