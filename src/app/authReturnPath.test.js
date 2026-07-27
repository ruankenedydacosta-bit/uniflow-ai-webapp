import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeAuthReturnPath,
  getSafeAuthReturnPath,
  readAuthReturnPath,
  saveAuthReturnPath,
} from './authReturnPath.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('preserva rota interna válida e query string', () => {
  assert.equal(getSafeAuthReturnPath('/financeiro?periodo=mes'), '/financeiro?periodo=mes');
});

test('usa dashboard sem destino ou para rota inválida', () => {
  assert.equal(getSafeAuthReturnPath(), '/dashboard');
  assert.equal(getSafeAuthReturnPath('/rota-inexistente'), '/dashboard');
});

test('bloqueia redirects externos e URLs protocol-relative', () => {
  assert.equal(getSafeAuthReturnPath('https://evil.example/financeiro'), '/dashboard');
  assert.equal(getSafeAuthReturnPath('//evil.example/financeiro'), '/dashboard');
});

test('salva, lê e consome destino OAuth em storage efêmero', () => {
  const storage = createStorage();
  saveAuthReturnPath('/suporte?origem=login', storage);
  assert.equal(readAuthReturnPath(storage), '/suporte?origem=login');
  assert.equal(consumeAuthReturnPath(storage), '/suporte?origem=login');
  assert.equal(readAuthReturnPath(storage), '/dashboard');
});
