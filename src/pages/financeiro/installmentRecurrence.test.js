import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_INSTALLMENTS,
  addMonthsToDate,
  buildInstallmentPayloads,
  generateInstallmentDates,
  resolveInstallmentScope,
  resolveInstallmentStatus,
  splitInstallmentAmounts,
  validateInstallmentCount,
} from './installmentUtils.js';
import {
  RECURRENCE_FREQUENCIES,
  buildRecurrenceRule,
  isValidRecurrenceRule,
} from './recurrenceUtils.js';

test('validateInstallmentCount aceita 1 a 360 e rejeita fora do limite', () => {
  assert.equal(validateInstallmentCount(1), true);
  assert.equal(validateInstallmentCount(360), true);
  assert.equal(validateInstallmentCount(12), true);
  assert.equal(validateInstallmentCount(0), false);
  assert.equal(validateInstallmentCount(361), false);
  assert.equal(validateInstallmentCount(2.5), false);
  assert.equal(validateInstallmentCount('abc'), false);
});

test('splitInstallmentAmounts divide em centavos e a soma bate com o total', () => {
  const amounts = splitInstallmentAmounts(100, 3);
  assert.deepEqual(amounts, [33.33, 33.33, 33.34]);
  const sumCents = amounts.reduce((acc, value) => acc + Math.round(value * 100), 0);
  assert.equal(sumCents, 10000);
});

test('splitInstallmentAmounts divide exatamente quando divisivel', () => {
  const amounts = splitInstallmentAmounts(300, 3);
  assert.deepEqual(amounts, [100, 100, 100]);
});

test('splitInstallmentAmounts com 1 parcela retorna o total integral', () => {
  assert.deepEqual(splitInstallmentAmounts(199.9, 1), [199.9]);
});

test('splitInstallmentAmounts rejeita valor invalido ou numero de parcelas invalido', () => {
  assert.throws(() => splitInstallmentAmounts(0, 3));
  assert.throws(() => splitInstallmentAmounts(-10, 3));
  assert.throws(() => splitInstallmentAmounts(100, 0));
  assert.throws(() => splitInstallmentAmounts(100, 361));
});

test('addMonthsToDate soma meses corretamente, incluindo virada de ano', () => {
  assert.equal(addMonthsToDate('2026-07-21', 1), '2026-08-21');
  assert.equal(addMonthsToDate('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonthsToDate('2026-01-31', 1), '2026-03-03');
});

test('generateInstallmentDates gera N datas mensais a partir da data inicial', () => {
  const dates = generateInstallmentDates('2026-07-21', 4);
  assert.deepEqual(dates, ['2026-07-21', '2026-08-21', '2026-09-21', '2026-10-21']);
});

test('generateInstallmentDates respeita o limite maximo de parcelas', () => {
  assert.throws(() => generateInstallmentDates('2026-07-21', MAX_INSTALLMENTS + 1));
});

test('resolveInstallmentStatus marca completed para hoje/passado e pending para futuro', () => {
  assert.equal(resolveInstallmentStatus('2026-07-21', '2026-07-21'), 'completed');
  assert.equal(resolveInstallmentStatus('2026-07-01', '2026-07-21'), 'completed');
  assert.equal(resolveInstallmentStatus('2026-08-01', '2026-07-21'), 'pending');
});

test('buildInstallmentPayloads monta N transacoes com valores, datas, numeros e status corretos', () => {
  const base = {
    account_id: 'account-1',
    transaction_type: 'expense',
    description: 'Notebook',
    amount: 100,
    transaction_date: '2026-07-21',
    status: 'completed',
  };

  const payloads = buildInstallmentPayloads(base, 3, { groupId: 'group-1', today: '2026-07-21' });

  assert.equal(payloads.length, 3);
  assert.deepEqual(
    payloads.map((p) => p.amount),
    [33.33, 33.33, 33.34],
  );
  assert.deepEqual(
    payloads.map((p) => p.transaction_date),
    ['2026-07-21', '2026-08-21', '2026-09-21'],
  );
  assert.deepEqual(
    payloads.map((p) => p.installment_number),
    [1, 2, 3],
  );
  payloads.forEach((p) => assert.equal(p.installment_total, 3));
  assert.deepEqual(
    payloads.map((p) => p.status),
    ['completed', 'pending', 'pending'],
  );
  payloads.forEach((p) => assert.equal(p.metadata.installment_group_id, 'group-1'));
});

test('buildInstallmentPayloads exige groupId e today', () => {
  const base = {
    amount: 100,
    transaction_date: '2026-07-21',
  };
  assert.throws(() => buildInstallmentPayloads(base, 2, { today: '2026-07-21' }));
  assert.throws(() => buildInstallmentPayloads(base, 2, { groupId: 'group-1' }));
});

function makeGroupTransactions() {
  return [
    { id: 'tx-1', installment_number: 1, metadata: { installment_group_id: 'group-1' } },
    { id: 'tx-2', installment_number: 2, metadata: { installment_group_id: 'group-1' } },
    { id: 'tx-3', installment_number: 3, metadata: { installment_group_id: 'group-1' } },
    { id: 'tx-other', installment_number: 1, metadata: { installment_group_id: 'group-2' } },
  ];
}

test('resolveInstallmentScope "only" afeta somente a transacao alvo', () => {
  const transactions = makeGroupTransactions();
  const ids = resolveInstallmentScope(transactions, transactions[1], 'only');
  assert.deepEqual(ids, ['tx-2']);
});

test('resolveInstallmentScope "forward" afeta a transacao alvo e as parcelas seguintes do mesmo grupo', () => {
  const transactions = makeGroupTransactions();
  const ids = resolveInstallmentScope(transactions, transactions[1], 'forward');
  assert.deepEqual(ids.sort(), ['tx-2', 'tx-3']);
});

test('resolveInstallmentScope "all" afeta todas as transacoes do mesmo grupo', () => {
  const transactions = makeGroupTransactions();
  const ids = resolveInstallmentScope(transactions, transactions[1], 'all');
  assert.deepEqual(ids.sort(), ['tx-1', 'tx-2', 'tx-3']);
});

test('resolveInstallmentScope sem grupo se comporta como "only" mesmo pedindo "all"', () => {
  const soloTransaction = { id: 'solo-1', metadata: {} };
  const ids = resolveInstallmentScope([soloTransaction], soloTransaction, 'all');
  assert.deepEqual(ids, ['solo-1']);
});

test('isValidRecurrenceRule valida frequencia, intervalo e endDate opcional', () => {
  assert.equal(isValidRecurrenceRule({ frequency: 'monthly', interval: 1 }), true);
  assert.equal(
    isValidRecurrenceRule({ frequency: 'weekly', interval: 2, endDate: '2027-01-01' }),
    true,
  );
  assert.equal(isValidRecurrenceRule({ frequency: 'invalid', interval: 1 }), false);
  assert.equal(isValidRecurrenceRule({ frequency: 'monthly', interval: 0 }), false);
  assert.equal(isValidRecurrenceRule({ frequency: 'monthly', interval: 1.5 }), false);
  assert.equal(
    isValidRecurrenceRule({ frequency: 'monthly', interval: 1, endDate: 'not-a-date' }),
    false,
  );
  assert.equal(isValidRecurrenceRule(null), false);
});

test('buildRecurrenceRule monta regra valida a partir do formulario', () => {
  const rule = buildRecurrenceRule({ frequency: 'monthly', interval: '1', endDate: '2027-07-21' });
  assert.deepEqual(rule, { frequency: 'monthly', interval: 1, endDate: '2027-07-21' });
});

test('buildRecurrenceRule omite endDate quando nao informado', () => {
  const rule = buildRecurrenceRule({ frequency: 'daily', interval: '2' });
  assert.deepEqual(rule, { frequency: 'daily', interval: 2 });
});

test('buildRecurrenceRule retorna null para entrada invalida', () => {
  assert.equal(buildRecurrenceRule({ frequency: 'yearly', interval: 0 }), null);
  assert.equal(buildRecurrenceRule({ frequency: 'nope', interval: 1 }), null);
});

test('RECURRENCE_FREQUENCIES expõe as 4 frequencias suportadas', () => {
  assert.deepEqual(RECURRENCE_FREQUENCIES, ['daily', 'weekly', 'monthly', 'yearly']);
});
