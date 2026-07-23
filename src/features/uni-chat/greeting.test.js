import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGreetingName } from './greeting.js';

test('retorna o primeiro nome quando full_name está presente', () => {
  assert.equal(resolveGreetingName({ full_name: 'Ana Beatriz Souza' }), 'Ana');
});

test('normaliza espaços extras e retorna só o primeiro nome', () => {
  assert.equal(resolveGreetingName({ full_name: '  Ruan   Pereira  ' }), 'Ruan');
});

test('retorna null quando profile está ausente (carregando/indisponível)', () => {
  assert.equal(resolveGreetingName(null), null);
  assert.equal(resolveGreetingName(undefined), null);
});

test('retorna null quando full_name está vazio ou só espaços', () => {
  assert.equal(resolveGreetingName({ full_name: '' }), null);
  assert.equal(resolveGreetingName({ full_name: '   ' }), null);
});

test('retorna null quando full_name não é string', () => {
  assert.equal(resolveGreetingName({ full_name: 123 }), null);
  assert.equal(resolveGreetingName({}), null);
});

test('não usa e-mail como substituto do nome', () => {
  // profile sem full_name, mas com e-mail em outro campo — deve ignorar
  assert.equal(resolveGreetingName({ email: 'user@example.com' }), null);
});
