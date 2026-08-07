import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationalMemory } from './conversationalMemory.js';

test('memória vazia nunca inventa -- resolveReferences devolve o texto inalterado', () => {
  const memory = createConversationalMemory();
  assert.equal(memory.resolveReferences('quanto tenho nessa conta?'), 'quanto tenho nessa conta?');
  assert.equal(memory.resolveReferences('quanto gastei com essa categoria?'), 'quanto gastei com essa categoria?');
  assert.equal(memory.resolveReferences('ele'), 'ele');
  assert.equal(memory.resolveReferences('isso'), 'isso');
});

test('remember(account) permite resolver "essa conta" / "aquela conta" / "nessa conta"', () => {
  const memory = createConversationalMemory();
  memory.remember({ account: 'Nubank' });
  assert.equal(memory.resolveReferences('quanto tenho nessa conta?'), 'quanto tenho na conta Nubank?');
  assert.equal(memory.resolveReferences('foi na conta essa conta'), 'foi na conta na conta Nubank');
  assert.equal(memory.resolveReferences('e naquela conta?'), 'e na conta Nubank?');
});

test('remember(category) permite resolver "essa categoria" / "aquela categoria"', () => {
  const memory = createConversationalMemory();
  memory.remember({ category: 'Mercado' });
  assert.equal(memory.resolveReferences('quanto gastei nessa categoria?'), 'quanto gastei com Mercado?');
  assert.equal(memory.resolveReferences('e naquela categoria?'), 'e com Mercado?');
});

test('pronome solto ("ele"/"ela"/"isso"/"aquilo") resolve para o último assunto lembrado', () => {
  const memory = createConversationalMemory();
  memory.remember({ account: 'Nubank' });
  assert.equal(memory.resolveReferences('Ele.'), 'na conta Nubank');
  assert.equal(memory.resolveReferences('isso'), 'na conta Nubank');

  memory.remember({ category: 'Mercado' });
  assert.equal(memory.resolveReferences('isso'), 'com Mercado');
});

test('pronome solto sem nada lembrado nunca inventa', () => {
  const memory = createConversationalMemory();
  assert.equal(memory.resolveReferences('ele'), 'ele');
});

test('remember só atualiza os campos informados -- não apaga o que já existia', () => {
  const memory = createConversationalMemory();
  memory.remember({ account: 'Nubank' });
  memory.remember({ category: 'Mercado' });
  assert.equal(memory.resolveReferences('nessa conta'), 'na conta Nubank');
  assert.equal(memory.resolveReferences('nessa categoria'), 'com Mercado');
});

test('getLastQuery/remember(queryType) guardam a última consulta para refinamento', () => {
  const memory = createConversationalMemory();
  assert.equal(memory.getLastQuery(), null);
  memory.remember({ queryType: 'period_expenses', queryParams: { start: '2026-08-01', end: '2026-08-31' } });
  assert.deepEqual(memory.getLastQuery(), {
    queryType: 'period_expenses',
    queryParams: { start: '2026-08-01', end: '2026-08-31' },
    response: null,
  });
});

test('getPeriod/remember(period) guardam o último período mencionado', () => {
  const memory = createConversationalMemory();
  assert.equal(memory.getPeriod(), null);
  memory.remember({ period: { start: '2026-08-01', end: '2026-08-31', label: 'este mês' } });
  assert.deepEqual(memory.getPeriod(), { start: '2026-08-01', end: '2026-08-31', label: 'este mês' });
});

test('reset() limpa toda a memória (nunca persiste entre conversas)', () => {
  const memory = createConversationalMemory();
  memory.remember({ account: 'Nubank', category: 'Mercado', queryType: 'period_expenses' });
  memory.reset();
  assert.equal(memory.resolveReferences('nessa conta'), 'nessa conta');
  assert.equal(memory.resolveReferences('nessa categoria'), 'nessa categoria');
  assert.equal(memory.getLastQuery(), null);
});
