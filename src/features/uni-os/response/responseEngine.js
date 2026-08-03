function freezeRecord(value) {
  return Object.freeze(value && typeof value === 'object' ? { ...value } : {});
}

export function createStructuredResponse(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.freeze({
    facts: freezeRecord(source.facts),
    plan: freezeRecord(source.plan),
    emotion: freezeRecord(source.emotion),
    personality: freezeRecord(source.personality),
    output: freezeRecord(source.output),
  });
}
