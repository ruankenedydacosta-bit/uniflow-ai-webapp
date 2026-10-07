import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildConfirmationEditForm,
  buildEditOverrides,
  initialEditValues,
  validateEditValues,
} from './confirmationEditForm.js';
import {
  CANCELED_WITH_FOLLOW_UP,
  FOLLOW_UP_QUESTION,
  withFollowUpQuestion,
} from './confirmationFollowUp.js';

const accounts = [
  { id: 'a2', name: 'Nubank' },
  { id: 'a1', name: 'Inter' },
  { id: 'a3', name: 'Antiga', is_active: false },
];
const categories = [
  { id: 'c1', name: 'Mercado', category_type: 'expense' },
  { id: 'c2', name: 'Salário', category_type: 'income' },
];
const expense = {
  status: 'ready',
  transactionType: 'expense',
  amount: 50,
  description: 'Feira',
  category: { id: 'c1', name: 'Mercado' },
  account: { id: 'a2', name: 'Nubank' },
  date: '2026-10-06',
};

test('despesa: valor, categoria do mesmo tipo, descrição, conta ativa e data', () => {
  const form = buildConfirmationEditForm({ action: expense, accounts, categories });
  assert.deepEqual(form.fields.map((field) => field.key), ['amount', 'categoryId', 'description', 'accountId', 'date']);
  const category = form.fields.find((field) => field.key === 'categoryId');
  assert.deepEqual(category.options, [{ value: 'c1', label: 'Mercado' }]);
  const account = form.fields.find((field) => field.key === 'accountId');
  assert.deepEqual(account.options.map((option) => option.label), ['Inter', 'Nubank']);
});

test('transferência tem origem e destino; ajuste edita o novo saldo', () => {
  const transfer = buildConfirmationEditForm({
    action: { ...expense, transactionType: 'transfer', destinationAccount: { id: 'a1' } },
    accounts,
    categories,
  });
  assert.deepEqual(transfer.fields.map((field) => field.key), ['amount', 'accountId', 'destinationAccountId', 'date']);
  const adjustment = buildConfirmationEditForm({
    action: { ...expense, transactionType: 'adjustment', balanceTarget: 900 },
    accounts,
  });
  assert.equal(adjustment.fields[0].label, 'Novo saldo');
  assert.equal(adjustment.fields[0].value, 900);
});

test('rascunho incompleto não abre formulário', () => {
  assert.equal(buildConfirmationEditForm({ action: { ...expense, status: 'needs_clarification' } }), null);
  assert.equal(buildConfirmationEditForm({}), null);
});

test('só o que mudou vira correção; nada mudou devolve vazio', () => {
  const form = buildConfirmationEditForm({ action: expense, accounts, categories });
  const values = initialEditValues(form);
  assert.deepEqual(buildEditOverrides(form, values), {});
  assert.deepEqual(
    buildEditOverrides(form, { ...values, amount: 72.5, accountId: 'a1', description: ' Feira da semana ' }),
    { amount: 72.5, description: 'Feira da semana', accountId: 'a1' },
  );
});

test('validação: valor zero, data vazia, descrição apagada e destino igual à origem', () => {
  const form = buildConfirmationEditForm({
    action: { ...expense, transactionType: 'transfer', destinationAccount: { id: 'a1' } },
    accounts,
  });
  const errors = validateEditValues(form, { amount: 0, accountId: 'a1', destinationAccountId: 'a1', date: '' });
  assert.ok(errors.amount);
  assert.ok(errors.date);
  assert.ok(errors.destinationAccountId);

  const expenseForm = buildConfirmationEditForm({ action: expense, accounts, categories });
  const expenseErrors = validateEditValues(expenseForm, { ...initialEditValues(expenseForm), description: '  ' });
  assert.ok(expenseErrors.description);
  assert.deepEqual(validateEditValues(expenseForm, initialEditValues(expenseForm)), {});
});

test('confirmar ou cancelar termina perguntando se a pessoa quer mais alguma coisa', () => {
  assert.equal(withFollowUpQuestion('Pronto. Registrei o lançamento. '), `Pronto. Registrei o lançamento. ${FOLLOW_UP_QUESTION}`);
  assert.equal(withFollowUpQuestion(''), FOLLOW_UP_QUESTION);
  assert.match(CANCELED_WITH_FOLLOW_UP, /^Cancelado, sem problemas\. Quer que eu faça mais alguma coisa\?$/);
});
