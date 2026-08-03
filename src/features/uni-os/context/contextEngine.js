function createReadOnlySnapshot(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  const snapshot = Array.isArray(value) ? [] : {};
  seen.set(value, snapshot);
  Object.entries(value).forEach(([key, nestedValue]) => {
    snapshot[key] = createReadOnlySnapshot(nestedValue, seen);
  });
  return Object.freeze(snapshot);
}

export function createReadOnlyContext(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.freeze({
    session: createReadOnlySnapshot(source.session ?? {}),
    user: createReadOnlySnapshot(source.user ?? {}),
    workspace: createReadOnlySnapshot(source.workspace ?? {}),
    language: typeof source.language === 'string' ? source.language : 'pt-BR',
    time: typeof source.time === 'string' ? source.time : null,
    shortHistory: createReadOnlySnapshot(
      Array.isArray(source.shortHistory) ? source.shortHistory.slice(0, 20) : [],
    ),
  });
}
