import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FINANCIAL_CACHE_FRESH_MS,
  buildFinancialCacheKey,
  clearFinancialQueryCache,
  isFinancialCacheFresh,
  markFinancialCacheStale,
  readFinancialCache,
  updateFinancialCacheData,
  writeFinancialCache,
} from './financialQueryCache.js';

test('chave exige espaço e separa os parâmetros da leitura', () => {
  clearFinancialQueryCache();
  assert.equal(buildFinancialCacheKey('transactions', { workspaceId: null }), null);

  const mesAtual = buildFinancialCacheKey('transactions', { workspaceId: 'w1', dateFrom: '2026-10-01' });
  const mesAnterior = buildFinancialCacheKey('transactions', { workspaceId: 'w1', dateFrom: '2026-09-01' });
  const outroEspaco = buildFinancialCacheKey('transactions', { workspaceId: 'w2', dateFrom: '2026-10-01' });
  assert.notEqual(mesAtual, mesAnterior);
  assert.notEqual(mesAtual, outroEspaco);

  writeFinancialCache(mesAtual, ['outubro']);
  assert.equal(readFinancialCache(mesAnterior), null);
  assert.deepEqual(readFinancialCache(mesAtual).data, ['outubro']);
});

test('leitura vale por 1 minuto', () => {
  clearFinancialQueryCache();
  const key = buildFinancialCacheKey('accounts', { workspaceId: 'w1' });
  writeFinancialCache(key, [], 1_000);
  const entry = readFinancialCache(key);

  assert.equal(FINANCIAL_CACHE_FRESH_MS, 60_000);
  assert.equal(isFinancialCacheFresh(entry, 1_000 + 59_999), true);
  assert.equal(isFinancialCacheFresh(entry, 1_000 + 60_000), false);
  assert.equal(isFinancialCacheFresh(null), false);
});

test('mudança local troca o dado sem renovar o prazo', () => {
  clearFinancialQueryCache();
  const key = buildFinancialCacheKey('transactions', { workspaceId: 'w1' });
  writeFinancialCache(key, ['a'], 1_000);
  updateFinancialCacheData(key, ['a', 'b']);

  assert.deepEqual(readFinancialCache(key), { data: ['a', 'b'], savedAt: 1_000 });
  // Sem leitura anterior, não cria entrada: a lista local pode ser o fallback.
  updateFinancialCacheData(buildFinancialCacheKey('transactions', { workspaceId: 'w2' }), ['x']);
  assert.equal(readFinancialCache(buildFinancialCacheKey('transactions', { workspaceId: 'w2' })), null);
});

test('gravação financeira vence o cache, mas o dado continua para pintar a tela', () => {
  clearFinancialQueryCache();
  const key = buildFinancialCacheKey('balances', { workspaceId: 'w1' });
  writeFinancialCache(key, { workspaceBalance: 10 });
  markFinancialCacheStale();

  const entry = readFinancialCache(key);
  assert.equal(isFinancialCacheFresh(entry), false);
  assert.deepEqual(entry.data, { workspaceBalance: 10 });
});

test('logout apaga o cache', async () => {
  writeFinancialCache(buildFinancialCacheKey('accounts', { workspaceId: 'w1' }), []);
  clearFinancialQueryCache();
  assert.equal(readFinancialCache(buildFinancialCacheKey('accounts', { workspaceId: 'w1' })), null);

  const session = await readFile(new URL('../app/SessionContext.jsx', import.meta.url), 'utf8');
  assert.match(session, /clearFinancialQueryCache\(\);/);
});

test('os quatro hooks do Financeiro leem o cache e não mostram carregando quando há dado guardado', async () => {
  for (const file of ['useAccounts.js', 'useCategories.js', 'useTransactions.js', 'useFinancialBalances.js']) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(source, /isFinancialCacheFresh\(cached\)/, file);
    assert.match(source, /writeFinancialCache\(cacheKey,/, file);
    assert.match(source, /useState\(\(\) => isSupabaseConfigured && !readFinancialCache\(cacheKey\)\)/, file);
  }
});
