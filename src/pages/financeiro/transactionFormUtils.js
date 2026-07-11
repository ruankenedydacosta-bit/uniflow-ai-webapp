export function createEmptyTransactionForm() {
  return {
    account_id: '',
    destination_account_id: '',
    category_id: '',
    transaction_type: 'expense',
    description: '',
    amount: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    status: 'completed',
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
  };
}

export function buildTransactionMutationPayload(form) {
  return {
    account_id: form.account_id,
    destination_account_id:
      form.transaction_type === 'transfer' ? form.destination_account_id : null,
    category_id: form.category_id || null,
    transaction_type: form.transaction_type,
    description: form.description,
    amount: form.amount,
    transaction_date: form.transaction_date,
    status: form.status ?? 'completed',
  };
}

export function getSelectableTransactionAccounts(accounts, editingId, form) {
  return accounts.filter(
    (account) =>
      account.is_active !== false ||
      (editingId &&
        [form.account_id, form.destination_account_id].includes(account.id)),
  );
}
