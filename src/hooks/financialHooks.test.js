import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAccounts } from './useAccounts.js';
import { useCategories } from './useCategories.js';
import { useTransactions } from './useTransactions.js';
import {
  cloneRecords,
  createDemoRecord,
  removeRecord,
  upsertRecord,
} from './financialHookUtils.js';
import { getFinanceErrorMessage } from '../pages/financeiro/financeUiUtils.js';

function renderHook(useHook, props) {
  let observedState;

  function HookProbe() {
    observedState = useHook(props);
    return null;
  }

  renderToStaticMarkup(createElement(HookProbe));
  return observedState;
}

test('useAccounts inicia com contas e tipos do fallback demo', () => {
  const state = renderHook(useAccounts, {
    fallbackAccounts: [{ id: 'account-1', name: 'Conta principal' }],
    fallbackAccountTypes: [{ code: 'checking', name: 'Conta corrente' }],
  });

  assert.equal(state.isDemoMode, true);
  assert.equal(state.accounts[0].name, 'Conta principal');
  assert.equal(state.accountTypes[0].code, 'checking');
  assert.equal(typeof state.saveAccount, 'function');
  assert.equal(typeof state.archiveAccount, 'function');
});

test('useCategories inicia com catalogo global do fallback', () => {
  const state = renderHook(useCategories, {
    fallbackCategories: [
      { id: 'category-1', name: 'Alimentação', is_system: true },
    ],
  });

  assert.equal(state.isDemoMode, true);
  assert.equal(state.categories[0].is_system, true);
  assert.equal(typeof state.saveCategory, 'function');
  assert.equal(typeof state.removeCategory, 'function');
});

test('useTransactions inicia com lancamentos locais', () => {
  const state = renderHook(useTransactions, {
    fallbackTransactions: [
      { id: 'transaction-1', description: 'Mercado', amount: 120 },
    ],
  });

  assert.equal(state.isDemoMode, true);
  assert.equal(state.transactions[0].description, 'Mercado');
  assert.equal(typeof state.saveTransaction, 'function');
  assert.equal(typeof state.removeTransaction, 'function');
});

test('helpers mantem CRUD local imutavel', () => {
  const original = [{ id: 'one', name: 'Original' }];
  const cloned = cloneRecords(original);
  const inserted = createDemoRecord('demo', { name: 'Nova' });
  const withInsert = upsertRecord(cloned, inserted);
  const withUpdate = upsertRecord(withInsert, { ...inserted, name: 'Atualizada' });
  const withoutRecord = removeRecord(withUpdate, inserted.id);

  assert.notEqual(cloned, original);
  assert.equal(original[0].name, 'Original');
  assert.equal(withInsert.length, 2);
  assert.equal(withUpdate[0].name, 'Atualizada');
  assert.deepEqual(withoutRecord, original);
});

test('mensagens tecnicas recebem fallback humano', () => {
  const technicalError = {
    code: '23503',
    message: 'insert or update violates foreign key constraint',
  };

  assert.equal(
    getFinanceErrorMessage(technicalError, 'Não foi possível concluir.'),
    'Não foi possível concluir.',
  );
  assert.equal(
    getFinanceErrorMessage(
      { code: 'INVALID_TRANSACTION_REQUEST', message: 'Valor inválido.' },
      'Fallback',
    ),
    'Valor inválido.',
  );
});

test('Financeiro usa workspace da sessao nos tres hooks', async () => {
  const source = await readFile(
    new URL('../pages/FinanceiroPage.jsx', import.meta.url),
    'utf8',
  );
  const workspaceBindings = source.match(/workspaceId: workspace\?\.id/g) ?? [];

  assert.match(source, /useSession\(\)/);
  assert.equal(workspaceBindings.length, 3);
});
