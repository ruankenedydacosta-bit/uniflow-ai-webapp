import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readWorkspaceContextHintSeen,
  writeWorkspaceContextHintSeen,
  WORKSPACE_CONTEXT_HINT_KEYS,
} from './workspaceContextHintStorage.js';

// ============================================================================
// UX5 -- persistência local (chave versionada, nunca Supabase) de já ter
// visto a explicação de troca de espaço. Mesmo padrão seguro já usado por
// features/theme/themeStorage.js e features/uni-instant/uniVoiceHintStorage.js.
// ============================================================================

test('chaves versionadas distintas para personal e business -- nunca uma explicação escondendo a outra', () => {
  assert.equal(WORKSPACE_CONTEXT_HINT_KEYS.personal, 'uniflow.workspace-context-hint.v1.personal-seen');
  assert.equal(WORKSPACE_CONTEXT_HINT_KEYS.business, 'uniflow.workspace-context-hint.v1.business-seen');
  assert.notEqual(WORKSPACE_CONTEXT_HINT_KEYS.personal, WORKSPACE_CONTEXT_HINT_KEYS.business);
});

test('leitura sem storage disponível (null) retorna false com segurança', () => {
  assert.equal(readWorkspaceContextHintSeen('personal', null), false);
});

test('leitura/escrita nunca lançam exceção se o storage falhar (modo privado, quota, etc.)', () => {
  const throwingStorage = {
    getItem() { throw new Error('storage indisponível'); },
    setItem() { throw new Error('storage indisponível'); },
  };
  assert.doesNotThrow(() => readWorkspaceContextHintSeen('personal', throwingStorage));
  assert.equal(readWorkspaceContextHintSeen('personal', throwingStorage), false);
  assert.doesNotThrow(() => writeWorkspaceContextHintSeen('personal', throwingStorage));
});

test('escrita marca o espaço como visto, e a leitura seguinte reflete isso -- o outro espaço permanece não visto', () => {
  const memory = new Map();
  const fakeStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
  };
  assert.equal(readWorkspaceContextHintSeen('personal', fakeStorage), false);
  writeWorkspaceContextHintSeen('personal', fakeStorage);
  assert.equal(readWorkspaceContextHintSeen('personal', fakeStorage), true);
  assert.equal(readWorkspaceContextHintSeen('business', fakeStorage), false);
});

test('tipo de workspace inválido não grava nem lê nada (sem chave para escrever)', () => {
  const memory = new Map();
  const fakeStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
  };
  writeWorkspaceContextHintSeen('nao-existe', fakeStorage);
  assert.equal(memory.size, 0);
  assert.equal(readWorkspaceContextHintSeen('nao-existe', fakeStorage), false);
});
