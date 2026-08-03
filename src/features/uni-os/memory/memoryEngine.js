function normalizeProviders(providers) {
  return Array.isArray(providers) ? providers.filter(Boolean) : [];
}

export async function consumeMemoryProviders(providers, request = {}) {
  const entries = [];

  for (const provider of normalizeProviders(providers)) {
    const read = typeof provider === 'function' ? provider : provider.read;
    if (typeof read !== 'function') continue;
    const result = await read(request);
    entries.push(Object.freeze({
      providerName: provider.providerName ?? read.name ?? 'memory_provider',
      data: result ?? null,
    }));
  }

  return Object.freeze({
    mode: 'read_only',
    entries: Object.freeze(entries),
    createdMemory: false,
    inferredMemory: false,
  });
}
