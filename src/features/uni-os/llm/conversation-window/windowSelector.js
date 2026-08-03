function asRecord(value) {
  return value && !Array.isArray(value) && typeof value === 'object' ? value : {};
}

function asCollection(value) {
  return Array.isArray(value) ? value : [];
}

function selectFirst(collection, limit) {
  return asCollection(collection).slice(0, limit);
}

function selectRecent(collection, limit) {
  const source = asCollection(collection);
  return source.slice(Math.max(0, source.length - limit));
}

export function resolveCompiledContext(compiledContext = {}) {
  const snapshot = asRecord(compiledContext);
  return asRecord(snapshot.compiledContext ?? snapshot);
}

export function resolveConversationMessages(conversation = {}) {
  const source = asRecord(conversation);
  if (Array.isArray(source.messages)) return source.messages;
  if (Array.isArray(source.history)) return source.history;
  return [];
}

export function selectConversationWindow(compiledContext = {}, limits = {}) {
  const source = resolveCompiledContext(compiledContext);
  const messages = resolveConversationMessages(source.conversation);
  const goals = asCollection(source.goals);
  const memory = asCollection(source.memory);
  const context = asCollection(source.context);
  const insights = asCollection(source.insights);

  return {
    selected: {
      messages: selectRecent(messages, limits.messages),
      goals: selectFirst(goals, limits.goals),
      memory: selectFirst(memory, limits.memory),
      context: selectFirst(context, limits.context),
      insights: selectFirst(insights, limits.insights),
      reflection: asRecord(source.reflection),
      security: asRecord(source.security),
      permissions: asRecord(source.permissions),
    },
    eligible: {
      messages: messages.length,
      goals: goals.length,
      memory: memory.length,
      context: context.length,
      insights: insights.length,
    },
  };
}
