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

import { createTransactionEditForm, localDateKey, resolveTransactionMetadata } from './transactionFormUtils.js';

test('localDateKey usa o dia do relógio local, não o UTC', () => {
  assert.equal(localDateKey(new Date(2026, 9, 12, 23, 30)), '2026-10-12');
});

test('previsto com confirmação automática grava metadata.auto_confirm sem perder o resto', () => {
  assert.deepEqual(
    resolveTransactionMetadata({ auto_confirm: true, metadata_base: { installment_group_id: 'g1' } }, 'pending'),
    { installment_group_id: 'g1', auto_confirm: true },
  );
});

test('sem confirmação automática e sem metadata antigo, a chave metadata fica de fora', () => {
  assert.equal(resolveTransactionMetadata({ auto_confirm: false }, 'pending'), undefined);
  const payload = buildTransactionMutationPayload(
    { transaction_type: 'expense', description: 'x', amount: '1', transaction_date: '2026-10-15', status: 'completed' },
    HOJE,
  );
  assert.equal('metadata' in payload, false);
});

test('desligar a confirmação automática remove só essa chave do metadata', () => {
  assert.deepEqual(
    resolveTransactionMetadata({ auto_confirm: false, metadata_base: { installment_group_id: 'g1', auto_confirm: true } }, 'pending'),
    { installment_group_id: 'g1' },
  );
});

test('virar realizado também remove auto_confirm', () => {
  assert.deepEqual(
    resolveTransactionMetadata({ auto_confirm: true, metadata_base: { auto_confirm: true } }, 'completed'),
    {},
  );
});

test('edição lê auto_confirm do metadata', () => {
  const form = createTransactionEditForm({
    account_id: 'a', transaction_type: 'expense', description: 'x', amount: 1,
    transaction_date: '2026-10-15', status: 'pending', metadata: { auto_confirm: true },
  });
  assert.equal(form.auto_confirm, true);
});

import { buildInstallmentMutationPayloads } from './transactionFormUtils.js';

test('parcelas só levam auto_confirm quando o lançamento é mesmo previsto', () => {
  const base = { transaction_type: 'expense', description: 'TV', amount: '300', installment_count: 3, status: 'completed' };
  const hoje = localDateKey();
  const escondido = buildInstallmentMutationPayloads(
    { ...base, transaction_date: hoje, auto_confirm: true },
    { groupId: 'g', today: hoje },
  );
  assert.equal(escondido.every((p) => !p.metadata.auto_confirm), true);

  const amanha = localDateKey(new Date(Date.now() + 2 * 86400000));
  const visivel = buildInstallmentMutationPayloads(
    { ...base, transaction_date: amanha, auto_confirm: true },
    { groupId: 'g', today: hoje },
  );
  assert.equal(visivel.every((p) => p.metadata.auto_confirm === true), true);
});

import { buildRecurringSeriesPayload, isRecurringSeriesForm } from './transactionFormUtils.js';

test('recorrente vira série só em entrada ou saída, sem parcelas (#222)', () => {
  const base = { is_recurring: true, transaction_type: 'expense', installment_count: 1 };
  assert.equal(isRecurringSeriesForm(base), true);
  assert.equal(isRecurringSeriesForm({ ...base, transaction_type: 'income' }), true);
  assert.equal(isRecurringSeriesForm({ ...base, transaction_type: 'transfer' }), false);
  assert.equal(isRecurringSeriesForm({ ...base, installment_count: 3 }), false);
  assert.equal(isRecurringSeriesForm({ ...base, is_recurring: false }), false);
});

test('série leva a regra, a primeira data e a confirmação automática do formulário', () => {
  assert.deepEqual(buildRecurringSeriesPayload({
    transaction_type: 'expense',
    account_id: '',
    category_id: 'cat-moradia',
    description: '  ',
    amount: '1500',
    recurrence_frequency: 'monthly',
    recurrence_interval: 1,
    transaction_date: '2026-10-05',
    recurrence_end_date: '',
    auto_confirm: true,
    payment_method: ' Pix ',
    notes: '',
  }), {
    transaction_type: 'expense',
    account_id: null,
    category_id: 'cat-moradia',
    description: 'Saída',
    amount: '1500',
    frequency: 'monthly',
    interval: 1,
    start_date: '2026-10-05',
    end_date: null,
    auto_confirm: true,
    payment_method: 'Pix',
    notes: null,
  });
});
