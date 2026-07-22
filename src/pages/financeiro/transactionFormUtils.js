import { buildInstallmentPayloads, validateInstallmentCount } from './installmentUtils.js';
import { buildRecurrenceRule } from './recurrenceUtils.js';

export function createEmptyTransactionForm(transactionType = 'expense') {
  return {
    account_id: '',
    destination_account_id: '',
    category_id: '',
    transaction_type: transactionType,
    description: '',
    amount: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    status: 'completed',
    payment_method: '',
    notes: '',
    installment_count: 1,
    is_recurring: false,
    recurrence_frequency: 'monthly',
    recurrence_interval: 1,
    recurrence_end_date: '',
  };
}

export function createTransactionEditForm(transaction) {
  return {
    account_id: transaction.account_id,
    destination_account_id: transaction.destination_account_id ?? '',
    category_id: transaction.category_id ?? '',
    transaction_type: transaction.transaction_type,
    description: transaction.description,
    amount: String(transaction.amount),
    transaction_date: transaction.transaction_date,
    status: transaction.status ?? 'completed',
    payment_method: transaction.payment_method ?? '',
    notes: transaction.notes ?? '',
    // Edição nunca gera novas parcelas — o campo fica travado em 1 (ver UI).
    installment_count: 1,
    is_recurring: Boolean(transaction.is_recurring),
    recurrence_frequency: transaction.recurrence_rule?.frequency ?? 'monthly',
    recurrence_interval: transaction.recurrence_rule?.interval ?? 1,
    recurrence_end_date: transaction.recurrence_rule?.endDate ?? '',
  };
}

// Pré-popula o formulário de CRIAÇÃO com os dados de um lançamento existente
// (duplicar). Nunca reaproveita o id, o status é sempre resetado para
// 'completed' e a data passa a ser hoje — trata-se de um NOVO lançamento,
// não de uma edição do original.
export function createTransactionDuplicateForm(transaction) {
  return {
    account_id: transaction.account_id,
    destination_account_id: transaction.destination_account_id ?? '',
    category_id: transaction.category_id ?? '',
    transaction_type: transaction.transaction_type,
    description: transaction.description,
    amount: String(transaction.amount),
    transaction_date: new Date().toISOString().slice(0, 10),
    status: 'completed',
    payment_method: transaction.payment_method ?? '',
    notes: transaction.notes ?? '',
    installment_count: 1,
    is_recurring: false,
    recurrence_frequency: 'monthly',
    recurrence_interval: 1,
    recurrence_end_date: '',
  };
}

export function buildTransactionMutationPayload(form) {
  const payload = {
    account_id: form.account_id,
    destination_account_id:
      form.transaction_type === 'transfer' ? form.destination_account_id : null,
    category_id: form.category_id || null,
    transaction_type: form.transaction_type,
    description: form.description,
    amount: form.amount,
    transaction_date: form.transaction_date,
    status: form.status ?? 'completed',
    payment_method: form.payment_method?.trim() ? form.payment_method.trim() : null,
    notes: form.notes?.trim() ? form.notes.trim() : null,
  };

  if (form.is_recurring) {
    const rule = buildRecurrenceRule({
      frequency: form.recurrence_frequency,
      interval: form.recurrence_interval,
      endDate: form.recurrence_end_date || undefined,
    });
    payload.is_recurring = Boolean(rule);
    payload.recurrence_rule = rule;
  } else {
    payload.is_recurring = false;
    payload.recurrence_rule = null;
  }

  return payload;
}

// Indica se o formulário atual deve gerar N transações parceladas em vez de
// uma única transação. Parcelamento e recorrência são mutuamente exclusivos
// nesta fase (decisão de escopo — evita ambiguidade de "parcela recorrente").
export function isInstallmentPurchase(form) {
  return Number(form.installment_count) > 1 && !form.is_recurring;
}

// Monta os N payloads de parcelas prontos para envio sequencial ao
// transactionService (uma chamada createTransaction por parcela — não há
// função atômica de lote no banco para este fluxo).
export function buildInstallmentMutationPayloads(form, { groupId, today }) {
  if (!validateInstallmentCount(form.installment_count)) {
    throw new Error('Numero de parcelas invalido (deve ser um inteiro entre 1 e 360).');
  }

  const basePayload = buildTransactionMutationPayload({ ...form, is_recurring: false });
  delete basePayload.is_recurring;
  delete basePayload.recurrence_rule;

  return buildInstallmentPayloads(basePayload, Number(form.installment_count), {
    groupId,
    today,
  });
}

export function getSelectableTransactionAccounts(accounts, editingId, form) {
  return accounts.filter(
    (account) =>
      account.is_active !== false ||
      (editingId &&
        [form.account_id, form.destination_account_id].includes(account.id)),
  );
}
