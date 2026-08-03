import { compressCognitiveCollections } from './contextCompressor.js';
import { sanitizeRecord } from './contextFilter.js';

function compileConversation(parsedIntent = {}) {
  const source = sanitizeRecord(parsedIntent);
  return {
    source: source.source ?? null,
    language: source.language ?? null,
    intent: source.intent ?? null,
    confidence: Number.isFinite(source.confidence) ? source.confidence : 0,
    entities: source.entities && typeof source.entities === 'object' ? source.entities : {},
    requiresConfirmation: source.requiresConfirmation === true,
    actionType: source.actionType ?? null,
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
  };
}

export function compileCognitiveContext(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const compressed = compressCognitiveCollections({
    goals: source.goalRanking?.rankedGoals,
    memory: source.memoryRanking?.rankedMemories,
    context: source.contextRanking?.rankedContext,
    insights: source.insights?.insights,
  }, { now: options.now });

  return {
    compiledContext: {
      conversation: compileConversation(source.parsedIntent),
      ...compressed.collections,
      planning: sanitizeRecord(source.planning),
      reflection: sanitizeRecord(source.reflection),
      security: sanitizeRecord(source.security),
      permissions: sanitizeRecord(source.permissions),
    },
    statistics: compressed.statistics,
  };
}

export { compileConversation };
