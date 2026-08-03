export function buildStructuredResponseSections(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    facts: {
      parsedIntent: source.parsedIntent,
      context: source.contextSnapshot,
      memory: source.memorySnapshot,
    },
    planning: source.planningSnapshot,
    reflection: source.reflectionSnapshot,
    security: source.securitySnapshot,
    permissions: source.permissionsSnapshot,
    cognition: source.cognitiveSnapshot,
  };
}
