// Cache local de memória (Fase 3).
//
// Reduz leituras repetidas do repository. Regras de segurança (seção 21):
//   - chaveado por userId + workspaceId (nunca mistura usuários);
//   - TTL curto;
//   - invalidado após escrita;
//   - invalidado no logout / troca de usuário / troca de workspace;
//   - nunca é fonte de verdade nem sobrevive como autorização;
//   - falha do cache cai para o repository (retorna null).

export function createMemoryCache({ ttlMs = 60 * 1000, now = Date.now } = {}) {
  const entries = new Map();

  function cacheKey({ userId, workspaceId }) {
    return `${String(userId ?? 'anonymous')}::${String(workspaceId ?? 'no-workspace')}`;
  }

  return {
    get(scope) {
      const key = cacheKey(scope);
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return entry.data;
    },

    set(scope, data) {
      const key = cacheKey(scope);
      entries.set(key, { data, expiresAt: now() + ttlMs });
      return data;
    },

    has(scope) {
      return this.get(scope) != null;
    },

    invalidate(scope) {
      entries.delete(cacheKey(scope));
    },

    invalidateAllForUser(userId) {
      if (typeof userId !== 'string') return;
      for (const key of entries.keys()) {
        if (key.startsWith(`${userId}::`)) entries.delete(key);
      }
    },

    invalidateAllForWorkspace(workspaceId) {
      if (typeof workspaceId !== 'string') return;
      for (const key of entries.keys()) {
        if (key.endsWith(`::${workspaceId}`) || key.includes(`::${workspaceId}::`)) {
          entries.delete(key);
        }
      }
    },

    clear() {
      entries.clear();
    },

    size() {
      return entries.size;
    },
  };
}
