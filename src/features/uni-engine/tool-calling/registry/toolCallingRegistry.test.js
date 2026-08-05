// Uni Engine — Fase 20: Tool Calling (base). Testes do registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolCallingRegistry } from './index.js';

function fixtureHandler() {
  return { ok: true };
}

test('registry - começa vazio e sem ferramentas reais', () => {
  const registry = createToolCallingRegistry();
  assert.equal(registry.size(), 0);
  assert.deepEqual(registry.list(), []);
});

test('registry - registra ferramenta segura de leitura', () => {
  const registry = createToolCallingRegistry();
  const result = registry.registerTool({ name: 'fixture.lookup', handler: fixtureHandler });
  assert.equal(result.ok, true);
  assert.equal(registry.size(), 1);
  assert.equal(registry.has('fixture.lookup'), true);
  assert.equal(registry.isEnabled('fixture.lookup'), true);
});

test('registry - rejeita definição inválida', () => {
  const registry = createToolCallingRegistry();
  assert.equal(registry.registerTool(null).ok, false);
  assert.equal(registry.registerTool({ handler: fixtureHandler }).error, 'REGISTRATION_NAME_MISSING');
  assert.equal(registry.registerTool({ name: 'x' }).error, 'REGISTRATION_HANDLER_MISSING');
});

test('registry - rejeita duplicata', () => {
  const registry = createToolCallingRegistry();
  registry.registerTool({ name: 'dup', handler: fixtureHandler });
  const r = registry.registerTool({ name: 'dup', handler: fixtureHandler });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'REGISTRATION_DUPLICATE');
});

test('registry - ferramenta writes=true exige allowWrites', () => {
  const registry = createToolCallingRegistry();
  const blocked = registry.registerTool({ name: 'fixture.write', handler: fixtureHandler, writes: true });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'REGISTRATION_WRITES_BLOCKED');
  assert.equal(registry.size(), 0);
});

test('registry - ferramenta writes=true com allowWrites explícito registra', () => {
  const registry = createToolCallingRegistry({ allowWrites: true });
  const ok = registry.registerTool({ name: 'fixture.write', handler: fixtureHandler, writes: true });
  assert.equal(ok.ok, true);
  const tool = registry.get('fixture.write');
  assert.equal(tool.writes, true);
});

test('registry - define enabled e requiresAuthorization nos defaults', () => {
  const registry = createToolCallingRegistry();
  registry.registerTool({ name: 'fixture.defaults', handler: fixtureHandler });
  const tool = registry.get('fixture.defaults');
  assert.equal(tool.enabled, true);
  assert.equal(tool.requiresAuthorization, true);
});

test('registry - remove e clear', () => {
  const registry = createToolCallingRegistry();
  registry.registerTool({ name: 'a', handler: fixtureHandler });
  registry.registerTool({ name: 'b', handler: fixtureHandler });
  assert.equal(registry.remove('a'), true);
  assert.equal(registry.has('a'), false);
  registry.clear();
  assert.equal(registry.size(), 0);
});
