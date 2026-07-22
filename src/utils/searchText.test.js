import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText } from './searchText.js';

test('normalizeSearchText remove acentos', () => {
  assert.equal(normalizeSearchText('João'), 'joao');
  assert.equal(normalizeSearchText('José da Conceição'), 'jose da conceicao');
});

test('normalizeSearchText baixa a caixa', () => {
  assert.equal(normalizeSearchText('MARIA SILVA'), 'maria silva');
});

test('normalizeSearchText corta espacos nas pontas', () => {
  assert.equal(normalizeSearchText('   maria   '), 'maria');
});

test('normalizeSearchText colapsa espacos internos consecutivos', () => {
  assert.equal(normalizeSearchText('maria    da   silva'), 'maria da silva');
});

test('normalizeSearchText trata null e undefined como string vazia', () => {
  assert.equal(normalizeSearchText(null), '');
  assert.equal(normalizeSearchText(undefined), '');
});

test('normalizeSearchText trata string vazia como string vazia', () => {
  assert.equal(normalizeSearchText(''), '');
});

test('normalizeSearchText converte valores nao-string com String()', () => {
  assert.equal(normalizeSearchText(123), '123');
});

test('normalizeSearchText combina remocao de acento, caixa e espacos numa unica chamada', () => {
  assert.equal(normalizeSearchText('  ÁLVARO   DE   SOUZA  '), 'alvaro de souza');
});
