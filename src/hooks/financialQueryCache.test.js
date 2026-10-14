import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FINANCIAL_CACHE_FRESH_MS,
  FINANCIAL_CACHE_MAX_AGE_MS,
  FINANCIAL_CACHE_MAX_ENTRIES,
  buildFinancialCacheKey,
  clearFinancialQueryCache,
  isFinancialCacheFresh,
  markFinancialCacheStale,
  readFinancialCache,
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
  const entry = readFinancialCache(key, 1_000);

  assert.equal(FINANCIAL_CACHE_FRESH_MS, 60_000);
  assert.equal(isFinancialCacheFresh(entry, 1_000 + 59_999), true);
  assert.equal(isFinancialCacheFresh(entry, 1_000 + 60_000), false);
  assert.equal(isFinancialCacheFresh(null), false);
});

test('entrada antiga sai e o cache tem teto de tamanho', () => {
  clearFinancialQueryCache();
  const key = buildFinancialCacheKey('accounts', { workspaceId: 'w1' });
  writeFinancialCache(key, [], 1_000);
  assert.ok(readFinancialCache(key, 1_000 + FINANCIAL_CACHE_MAX_AGE_MS - 1));
  assert.equal(readFinancialCache(key, 1_000 + FINANCIAL_CACHE_MAX_AGE_MS), null);

  for (let index = 0; index <= FINANCIAL_CACHE_MAX_ENTRIES; index += 1) {
    writeFinancialCache(buildFinancialCacheKey('transactions', { workspaceId: 'w1', dateFrom: `m${index}` }), []);
  }
  // A primeira gravada é a que sai.
  assert.equal(readFinancialCache(buildFinancialCacheKey('transactions', { workspaceId: 'w1', dateFrom: 'm0' })), null);
  assert.ok(readFinancialCache(buildFinancialCacheKey('transactions', { workspaceId: 'w1', dateFrom: `m${FINANCIAL_CACHE_MAX_ENTRIES}` })));
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

test('troca de usuário apaga o cache', async () => {
  writeFinancialCache(buildFinancialCacheKey('accounts', { workspaceId: 'w1' }), []);
  clearFinancialQueryCache();
  assert.equal(readFinancialCache(buildFinancialCacheKey('accounts', { workspaceId: 'w1' })), null);

  const session = await readFile(new URL('../app/SessionContext.jsx', import.meta.url), 'utf8');
  // Logout, sessão expirada e outro usuário entrando sem logout.
  assert.equal(session.match(/clearFinancialQueryCache\(\);/g)?.length, 2);
});

test('os quatro hooks do Financeiro leem o cache e não mostram carregando quando há dado guardado', async () => {
  for (const file of ['useAccounts.js', 'useCategories.js', 'useTransactions.js', 'useFinancialBalances.js']) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(source, /if \(isFinancialCacheFresh\(readFinancialCache\(cacheKey\)\)\) return;/, file);
    assert.match(source, /writeFinancialCache\(cacheKey,/, file);
    assert.match(source, /useState\(isSupabaseConfigured && !cached\)/, file);
    assert.match(source, /if \(!readFinancialCache\(cacheKey\)\) setIsLoading\(true\);/, file);
    assert.match(source, /if \(renderedKey !== cacheKey\) \{/, file);
  }
});

test('gravação pelos hooks apaga o cache inteiro', async () => {
  const contagens = { 'useAccounts.js': 3, 'useCategories.js': 5, 'useTransactions.js': 1 };
  for (const [file, total] of Object.entries(contagens)) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.equal(source.match(/clearFinancialQueryCache\(\);/g)?.length, total, file);
  }
});
