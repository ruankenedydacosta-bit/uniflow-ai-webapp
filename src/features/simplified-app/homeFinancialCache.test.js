import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_FINANCIAL_CACHE_MAX_AGE_MS,
  buildHomeFinancialCacheKey,
  clearHomeFinancialCacheForUser,
  pickCacheableHomeFinancialData,
  readHomeFinancialCache,
  writeHomeFinancialCache,
} from './homeFinancialCache.js';

// Storage falso com a MESMA superfície do localStorage (length/key/getItem/
// setItem/removeItem) -- clearHomeFinancialCacheForUser varre por índice.
function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

const GRAPH = Object.freeze({
  periodLabel: 'agosto de 2026',
  hasMovements: true,
  income: 1000,
  expense: 250.5,
  incomeLabel: 'R$ 1.000,00',
  expenseLabel: 'R$ 250,50',
  // getMonthRange devolve um Date aqui -- é justamente o que NÃO pode ser
  // guardado (não sobrevive a JSON).
  monthRange: { date: new Date(2026, 7, 19), dateFrom: '2026-08-01', dateTo: '2026-08-31' },
  chart: { data: [{ day: 1, value: 10 }], todayDay: 19 },
  recent: { income: [{ id: 'i1' }], expense: [{ id: 'e1' }] },
});

const BASE = { userId: 'u1', workspaceId: 'w1', periodKey: '2026-08' };

// ============================================================================
// HOME-INSTANT1 -- cache do último estado financeiro da Home.
// ============================================================================

test('chave inclui SEMPRE userId e workspaceId -- nunca vaza dado financeiro entre contas no mesmo aparelho', () => {
  assert.equal(buildHomeFinancialCacheKey('u1', 'w1'), 'uniflow.home-financial.v1:u1:w1');
  assert.notEqual(buildHomeFinancialCacheKey('u1', 'w1'), buildHomeFinancialCacheKey('u2', 'w1'));
  assert.equal(buildHomeFinancialCacheKey(null, 'w1'), null);
  assert.equal(buildHomeFinancialCacheKey('u1', null), null);
});

test('guarda só o recorte renderizado -- o Date de monthRange nunca entra (não sobrevive a JSON)', () => {
  const picked = pickCacheableHomeFinancialData(GRAPH, 7);
  assert.equal(picked.monthRange, undefined);
  assert.equal(picked.periodLabel, 'agosto de 2026');
  assert.equal(picked.incomeLabel, 'R$ 1.000,00');
  assert.equal(picked.expenseLabel, 'R$ 250,50');
  assert.equal(picked.transactionCount, 7);
  assert.deepEqual(picked.chart, { data: [{ day: 1, value: 10 }], todayDay: 19 });
  assert.deepEqual(picked.recent, { income: [{ id: 'i1' }], expense: [{ id: 'e1' }] });
  // Sobrevive intacto a um round-trip de JSON -- é o que o storage faz.
  assert.deepEqual(JSON.parse(JSON.stringify(picked)), picked);
});

test('escreve e lê de volta o mesmo estado -- reabrir o app pinta os números salvos', () => {
  const storage = createStorage();
  const data = pickCacheableHomeFinancialData(GRAPH, 3);
  writeHomeFinancialCache({ ...BASE, data, now: 1000, storage });
  assert.deepEqual(readHomeFinancialCache({ ...BASE, now: 2000, storage }), data);
});

test('cache de OUTRO mês nunca é usado -- virar o mês invalida sozinho', () => {
  const storage = createStorage();
  writeHomeFinancialCache({ ...BASE, data: pickCacheableHomeFinancialData(GRAPH, 3), now: 1000, storage });
  assert.equal(readHomeFinancialCache({ ...BASE, periodKey: '2026-09', now: 2000, storage }), null);
});

test('cache de OUTRO usuário/workspace nunca é lido', () => {
  const storage = createStorage();
  writeHomeFinancialCache({ ...BASE, data: pickCacheableHomeFinancialData(GRAPH, 3), now: 1000, storage });
  assert.equal(readHomeFinancialCache({ ...BASE, userId: 'u2', now: 2000, storage }), null);
  assert.equal(readHomeFinancialCache({ ...BASE, workspaceId: 'w2', now: 2000, storage }), null);
});

test('cache expirado não pinta números velhos como atuais', () => {
  const storage = createStorage();
  writeHomeFinancialCache({ ...BASE, data: pickCacheableHomeFinancialData(GRAPH, 3), now: 0, storage });
  const justInside = HOME_FINANCIAL_CACHE_MAX_AGE_MS - 1;
  assert.notEqual(readHomeFinancialCache({ ...BASE, now: justInside, storage }), null);
  assert.equal(readHomeFinancialCache({ ...BASE, now: HOME_FINANCIAL_CACHE_MAX_AGE_MS + 1, storage }), null);
});

test('JSON corrompido nunca derruba a Home -- vira "sem cache"', () => {
  const storage = createStorage({ 'uniflow.home-financial.v1:u1:w1': '{isso não é json' });
  assert.equal(readHomeFinancialCache({ ...BASE, storage }), null);
});

test('storage indisponível (modo privado) nunca lança, na leitura nem na escrita', () => {
  const hostile = {
    get length() { throw new Error('bloqueado'); },
    key: () => { throw new Error('bloqueado'); },
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('bloqueado'); },
    removeItem: () => { throw new Error('bloqueado'); },
  };
  assert.equal(readHomeFinancialCache({ ...BASE, storage: hostile }), null);
  assert.doesNotThrow(() => writeHomeFinancialCache({ ...BASE, data: { a: 1 }, storage: hostile }));
  assert.doesNotThrow(() => clearHomeFinancialCacheForUser('u1', hostile));
});

// Segurança: sem isto, o próximo usuário no mesmo aparelho veria os números
// do anterior piscarem na tela antes do fetch.
test('logout apaga TODO cache do usuário (qualquer workspace) e preserva o de outros usuários', () => {
  const storage = createStorage();
  writeHomeFinancialCache({ userId: 'u1', workspaceId: 'w1', periodKey: '2026-08', data: { a: 1 }, storage });
  writeHomeFinancialCache({ userId: 'u1', workspaceId: 'w2', periodKey: '2026-08', data: { a: 2 }, storage });
  writeHomeFinancialCache({ userId: 'u2', workspaceId: 'w1', periodKey: '2026-08', data: { a: 3 }, storage });

  clearHomeFinancialCacheForUser('u1', storage);

  assert.equal(readHomeFinancialCache({ userId: 'u1', workspaceId: 'w1', periodKey: '2026-08', storage }), null);
  assert.equal(readHomeFinancialCache({ userId: 'u1', workspaceId: 'w2', periodKey: '2026-08', storage }), null);
  assert.deepEqual(readHomeFinancialCache({ userId: 'u2', workspaceId: 'w1', periodKey: '2026-08', storage }), { a: 3 });
});

test('sem userId/workspaceId não lê nem escreve nada -- nunca uma chave global compartilhada', () => {
  const storage = createStorage();
  writeHomeFinancialCache({ userId: null, workspaceId: 'w1', periodKey: '2026-08', data: { a: 1 }, storage });
  assert.deepEqual(storage._dump(), {});
  assert.equal(readHomeFinancialCache({ userId: null, workspaceId: 'w1', periodKey: '2026-08', storage }), null);
});
