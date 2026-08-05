// Uni Engine — Fase 20: Tool Calling (base). Registry isolado.
//
// Registry de integração real. Somente fixtures seguras podem ser registradas
// durante testes — nenhuma ferramenta real, nenhuma escrita financeira,
// nenhum acesso a Asaas/Supabase/auth/Open Finance/voz/arquivos do usuário.
//
// Garantias:
//   - handlers nunca são expostos diretamente (só via getDefinition/has);
//   - ferramentas com writes=true exigem allowWrites explícito do registry;
//   - não registra nenhuma ferramenta por padrão (registry começa vazio).
export function createToolCallingRegistry({ allowWrites = false } = {}) {
  const tools = new Map();

  function registerTool(definition) {
    if (!definition || typeof definition !== 'object') {
      return { ok: false, error: 'REGISTRATION_DEFINITION_INVALID' };
    }
    if (typeof definition.name !== 'string' || definition.name.trim() === '') {
      return { ok: false, error: 'REGISTRATION_NAME_MISSING' };
    }
    const name = definition.name.trim();
    if (typeof definition.handler !== 'function') {
      return { ok: false, error: 'REGISTRATION_HANDLER_MISSING' };
    }
    const writes = Boolean(definition.writes);
    if (writes && allowWrites !== true) {
      return { ok: false, error: 'REGISTRATION_WRITES_BLOCKED' };
    }
    if (tools.has(name)) {
      return { ok: false, error: 'REGISTRATION_DUPLICATE' };
    }
    tools.set(name, Object.freeze({
      name,
      handler: definition.handler,
      writes,
      enabled: definition.enabled !== false,
      requiresAuthorization: definition.requiresAuthorization !== false,
      timeoutMs: Number.isFinite(definition.timeoutMs) && definition.timeoutMs > 0 ? definition.timeoutMs : null,
      metadata: definition.metadata && typeof definition.metadata === 'object'
        ? Object.freeze({ ...definition.metadata })
        : Object.freeze({}),
    }));
    return { ok: true, name };
  }

  function has(name) {
    return typeof name === 'string' && tools.has(name);
  }

  function get(name) {
    if (!has(name)) return null;
    return tools.get(name);
  }

  function isEnabled(name) {
    const tool = get(name);
    return Boolean(tool && tool.enabled);
  }

  function list() {
    return [...tools.keys()];
  }

  function remove(name) {
    return tools.delete(name);
  }

  function size() {
    return tools.size;
  }

  function clear() {
    tools.clear();
    return { ok: true };
  }

  return {
    registerTool,
    has,
    get,
    isEnabled,
    list,
    remove,
    size,
    clear,
  };
}
