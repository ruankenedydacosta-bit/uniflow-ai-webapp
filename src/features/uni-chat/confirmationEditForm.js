// Formulário do botão "Editar" do card de confirmação. Os campos saem do
// rascunho que o card mostra, e o que a pessoa muda volta como as mesmas
// correções que a frase "muda o valor para 50" produz
// (financialConversation.provideInput), então a validação e o card novo
// continuam vindo do fluxo de sempre.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const EDIT_DESCRIPTION_MAX_LENGTH = 120;

function byName(left, right) {
  return left.label.localeCompare(right.label, 'pt-BR', { sensitivity: 'base' });
}

function toOptions(records) {
  return records
    .filter((record) => record?.id && record.is_active !== false)
    .map((record) => ({ value: String(record.id), label: record.name ?? '' }))
    .sort(byName);
}

// null quando o rascunho não tem o que editar (ainda falta campo, ou é
// outro tipo de card).
export function buildConfirmationEditForm({ action, accounts = [], categories = [] } = {}) {
  if (action?.status !== 'ready') return null;
  const type = action.transactionType;
  const isAdjustment = type === 'adjustment';
  const isTransfer = type === 'transfer';
  const accountOptions = toOptions(Array.isArray(accounts) ? accounts : []);
  const fields = [];

  fields.push({
    key: 'amount',
    label: isAdjustment ? 'Novo saldo' : 'Valor',
    type: 'money',
    value: isAdjustment ? action.balanceTarget ?? action.amount : action.amount,
  });

  if (!isAdjustment && !isTransfer) {
    const categoryOptions = toOptions(
      (Array.isArray(categories) ? categories : []).filter((category) => category?.category_type === type),
    );
    if (categoryOptions.length) {
      fields.push({
        key: 'categoryId',
        label: 'Categoria',
        type: 'select',
        value: action.category?.id ? String(action.category.id) : '',
        options: categoryOptions,
      });
    }
    fields.push({
      key: 'description',
      label: 'Descrição',
      type: 'text',
      value: action.description ?? '',
    });
  }

  if (accountOptions.length) {
    fields.push({
      key: 'accountId',
      label: isTransfer ? 'Conta de origem' : 'Conta',
      type: 'select',
      value: action.account?.id ? String(action.account.id) : '',
      options: accountOptions,
    });
    if (isTransfer) {
      fields.push({
        key: 'destinationAccountId',
        label: 'Conta de destino',
        type: 'select',
        value: action.destinationAccount?.id ? String(action.destinationAccount.id) : '',
        options: accountOptions,
      });
    }
  }

  fields.push({ key: 'date', label: 'Data', type: 'date', value: action.date ?? '' });

  return { fields };
}

export function initialEditValues(form) {
  return Object.fromEntries((form?.fields ?? []).map((field) => [field.key, field.value ?? '']));
}

// Erro por campo, em texto para a tela. Objeto vazio quando dá para salvar.
export function validateEditValues(form, values) {
  const errors = {};
  for (const field of form?.fields ?? []) {
    const value = values?.[field.key];
    if (field.type === 'money' && !(Number(value) > 0)) {
      errors[field.key] = 'Informe um valor maior que zero.';
    }
    if (field.type === 'select' && !field.options.some((option) => option.value === value)) {
      errors[field.key] = 'Escolha uma opção.';
    }
    if (field.type === 'date' && !DATE_PATTERN.test(String(value ?? ''))) {
      errors[field.key] = 'Informe a data.';
    }
    if (field.type === 'text') {
      const text = String(value ?? '').trim();
      if (!text && String(field.value ?? '').trim()) errors[field.key] = 'Informe a descrição.';
      if (text.length > EDIT_DESCRIPTION_MAX_LENGTH) {
        errors[field.key] = `Use até ${EDIT_DESCRIPTION_MAX_LENGTH} caracteres.`;
      }
    }
  }
  if (
    values?.destinationAccountId
    && values.destinationAccountId === values.accountId
  ) {
    errors.destinationAccountId = 'Escolha uma conta diferente da conta de origem.';
  }
  return errors;
}

// Só os campos que mudaram, no formato de provideInput. Objeto vazio quando
// nada mudou.
export function buildEditOverrides(form, values) {
  const overrides = {};
  for (const field of form?.fields ?? []) {
    const value = values?.[field.key];
    if (field.type === 'money') {
      const amount = Math.round(Number(value) * 100) / 100;
      if (amount !== Math.round(Number(field.value) * 100) / 100) overrides.amount = amount;
      continue;
    }
    const next = field.type === 'text' ? String(value ?? '').trim() : String(value ?? '');
    const previous = String(field.value ?? '').trim();
    if (next === previous || !next) continue;
    overrides[field.key] = next;
  }
  return overrides;
}
