import {
  isValidInsight,
  isValidRankedContext,
  isValidRankedGoal,
  isValidRankedMemory,
  sanitizeStructuredValue,
} from './contextFilter.js';

function deduplicate(values, keyOf) {
  const entries = new Map();
  let duplicatesRemoved = 0;
  values.forEach((value) => {
    const key = keyOf(value);
    if (!entries.has(key)) {
      entries.set(key, value);
      return;
    }
    duplicatesRemoved += 1;
    const current = entries.get(key);
    if ((value.score ?? 0) > (current.score ?? 0)) entries.set(key, value);
  });
  return { values: [...entries.values()], duplicatesRemoved };
}

function compressCollection(source, validator, keyOf) {
  const input = Array.isArray(source) ? source : [];
  const sanitized = input.map((value) => sanitizeStructuredValue(value));
  const valid = sanitized.filter((value) => validator(value));
  const deduplicated = deduplicate(valid, keyOf);
  return {
    values: deduplicated.values,
    inputCount: input.length,
    filteredItems: input.length - valid.length,
    duplicatesRemoved: deduplicated.duplicatesRemoved,
  };
}

function compressInsights(source) {
  const compressed = compressCollection(source, isValidInsight, (value) => value.insightId);
  const actionable = compressed.values.filter((insight) => insight.type !== 'NO_INSIGHT');
  if (actionable.length === 0) {
    const noInsight = compressed.values.find((insight) => insight.type === 'NO_INSIGHT');
    return { ...compressed, values: noInsight ? [noInsight] : [] };
  }
  const removedSentinels = compressed.values.length - actionable.length;
  return {
    ...compressed,
    values: actionable,
    filteredItems: compressed.filteredItems + removedSentinels,
  };
}

export function compressCognitiveCollections(input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const goals = compressCollection(input.goals, isValidRankedGoal, (value) => value.goalId);
  const memory = compressCollection(
    input.memory,
    (value) => isValidRankedMemory(value, now),
    (value) => value.memoryId,
  );
  const context = compressCollection(
    input.context,
    (value) => isValidRankedContext(value, now),
    (value) => value.key,
  );
  const insights = compressInsights(input.insights);
  const groups = [goals, memory, context, insights];

  return {
    collections: {
      goals: goals.values,
      memory: memory.values,
      context: context.values,
      insights: insights.values,
    },
    statistics: {
      inputItems: groups.reduce((total, group) => total + group.inputCount, 0),
      outputItems: groups.reduce((total, group) => total + group.values.length, 0),
      duplicatesRemoved: groups.reduce((total, group) => total + group.duplicatesRemoved, 0),
      filteredItems: groups.reduce((total, group) => total + group.filteredItems, 0),
    },
  };
}
