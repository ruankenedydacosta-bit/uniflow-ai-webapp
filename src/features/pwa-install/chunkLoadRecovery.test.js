import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CHUNK_LOAD_RECOVERY_GUARD_KEY,
  isChunkLoadError,
  recoverFromChunkLoadError,
} from './chunkLoadRecovery.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function createRuntime({ sessionStorage = createStorage() } = {}) {
  const runtime = {};
  runtime.sessionStorage = sessionStorage;
  runtime.reloadCalls = 0;
  runtime.location = { reload: () => { runtime.reloadCalls += 1; } };
  return runtime;
}

test('isChunkLoadError reconhece ChunkLoadError pelo name, mesmo com mensagem generica', () => {
  assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: 'Loading chunk 42 failed' }), true);
});

test('isChunkLoadError reconhece "Failed to fetch dynamically imported module" (erro real do navegador)', () => {
  assert.equal(
    isChunkLoadError({ name: 'TypeError', message: 'Failed to fetch dynamically imported module: https://app/assets/chunk-abc.js' }),
    true,
  );
});

test('isChunkLoadError reconhece variantes do WebKit/Safari (iOS) de falha de import() dinamico', () => {
  assert.equal(
    isChunkLoadError({ name: 'TypeError', message: 'error loading dynamically imported module' }),
    true,
  );
  assert.equal(
    isChunkLoadError({ name: 'SyntaxError', message: 'Importing a module script failed' }),
    true,
  );
});

test('isChunkLoadError NUNCA casa com um erro de negocio normal -- nunca dispara recovery para um bug nao relacionado', () => {
  assert.equal(isChunkLoadError({ name: 'ValidationError', message: 'Campo obrigatório: valor' }), false);
  assert.equal(isChunkLoadError({ name: 'TypeError', message: "Cannot read properties of undefined (reading 'foo')" }), false);
});

test('isChunkLoadError lida com erro sem name/message (undefined/null) sem lançar', () => {
  assert.equal(isChunkLoadError(undefined), false);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError({}), false);
});

test('recoverFromChunkLoadError: primeira vez -- marca a guarda em sessionStorage e recarrega uma unica vez', () => {
  const runtime = createRuntime();
  const fired = recoverFromChunkLoadError({ runtime });
  assert.equal(fired, true);
  assert.equal(runtime.reloadCalls, 1);
  assert.equal(runtime.sessionStorage.getItem(CHUNK_LOAD_RECOVERY_GUARD_KEY), '1');
});

test('recoverFromChunkLoadError: guarda ja usada -- NUNCA recarrega uma segunda vez (protecao contra loop)', () => {
  const runtime = createRuntime();
  assert.equal(recoverFromChunkLoadError({ runtime }), true);
  assert.equal(recoverFromChunkLoadError({ runtime }), false);
  assert.equal(runtime.reloadCalls, 1, 'apenas UM reload, mesmo apos duas chamadas de recovery');
});

test('recoverFromChunkLoadError: usa sessionStorage (nao localStorage) -- uma sessao nova sempre ganha nova chance', () => {
  const sessionStorage = createStorage();
  const runtime = createRuntime({ sessionStorage });
  recoverFromChunkLoadError({ runtime });
  assert.equal(sessionStorage.getItem(CHUNK_LOAD_RECOVERY_GUARD_KEY), '1');

  // Nova "sessao": sessionStorage novo (equivalente a aba nova/app relancado),
  // mesmo runtime.location -- deve poder recarregar de novo, sem herdar a
  // guarda da sessao anterior.
  const freshRuntime = createRuntime();
  assert.equal(recoverFromChunkLoadError({ runtime: freshRuntime }), true);
  assert.equal(freshRuntime.reloadCalls, 1);
});

test('recoverFromChunkLoadError: sessionStorage indisponivel (lança ao gravar) -- nunca arrisca reload sem guarda real', () => {
  const brokenStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  const runtime = createRuntime({ sessionStorage: brokenStorage });
  const fired = recoverFromChunkLoadError({ runtime });
  assert.equal(fired, false);
  assert.equal(runtime.reloadCalls, 0);
});

// PWA-UPDATE3: main.jsx é o unico ponto que liga chunkLoadRecovery aos
// hooks reais do React 19 (onUncaughtError/onRecoverableError) e a um
// unhandledrejection global -- garante que a integracao continua ligada
// nos tres pontos de entrada, e que nenhum deles duplica o log ja feito
// por installGlobalTelemetryHandlers.
test('main.jsx liga isChunkLoadError/recoverFromChunkLoadError em onUncaughtError, onRecoverableError e unhandledrejection', async () => {
  const main = await source('../../main.jsx');
  assert.match(main, /import \{ isChunkLoadError, recoverFromChunkLoadError \} from '\.\/features\/pwa-install\/chunkLoadRecovery\.js';/);
  assert.match(main, /function recoverIfChunkLoadError\(error\) \{\s*\n\s*if \(isChunkLoadError\(error\)\) recoverFromChunkLoadError\(\);/);
  assert.match(main, /onUncaughtError: \(error\) => \{[\s\S]*?recoverIfChunkLoadError\(error\);[\s\S]*?\},/);
  assert.match(main, /onRecoverableError: \(error\) => \{[\s\S]*?recoverIfChunkLoadError\(error\);[\s\S]*?\},/);
  assert.match(main, /function handleUnhandledRejectionForChunkRecovery\(event\) \{\s*\n\s*recoverIfChunkLoadError\(event\?\.reason\);/);
  assert.match(main, /globalThis\.addEventListener\?\.\('unhandledrejection', handleUnhandledRejectionForChunkRecovery\);/);
  assert.match(main, /globalThis\.removeEventListener\?\.\('unhandledrejection', handleUnhandledRejectionForChunkRecovery\);/);
});

test('main.jsx nunca instala o listener de unhandledrejection duas vezes -- uma unica chamada addEventListener', async () => {
  const main = await source('../../main.jsx');
  const occurrences = main.match(/addEventListener\?\.\('unhandledrejection'/g) ?? [];
  assert.equal(occurrences.length, 1);
});
