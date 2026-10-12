import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTransactionMutationPayload,
  resolveTransactionStatus,
} from './transactionFormUtils.js';

const HOJE = '2026-10-12';

test('data depois de hoje grava pending', () => {
  assert.equal(
    resolveTransactionStatus({ transaction_date: '2026-10-15', status: 'completed' }, HOJE),
    'pending',
  );
});

test('hoje ou passada mantém o status do formulário', () => {
  assert.equal(resolveTransactionStatus({ transaction_date: HOJE, status: 'completed' }, HOJE), 'completed');
  assert.equal(resolveTransactionStatus({ transaction_date: '2026-10-01' }, HOJE), 'completed');
});

test('previsto vencido continua pending ao ser editado', () => {
  assert.equal(resolveTransactionStatus({ transaction_date: '2026-10-10', status: 'pending' }, HOJE), 'pending');
});

test('cancelado e falho não viram pending com data futura', () => {
  assert.equal(resolveTransactionStatus({ transaction_date: '2026-11-01', status: 'canceled' }, HOJE), 'canceled');
  assert.equal(resolveTransactionStatus({ transaction_date: '2026-11-01', status: 'failed' }, HOJE), 'failed');
});

test('o payload usa o status resolvido pela data', () => {
  const payload = buildTransactionMutationPayload(
    { transaction_type: 'expense', description: 'Impostos', amount: '3000', transaction_date: '2026-10-15', status: 'completed' },
    HOJE,
  );
  assert.equal(payload.status, 'pending');
});
