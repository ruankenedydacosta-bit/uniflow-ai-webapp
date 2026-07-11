import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const TRANSACTION_FIELDS =
  'id, workspace_id, account_id, destination_account_id, category_id, transaction_type, description, amount, transaction_date, competence_date, status, payment_method, notes, is_recurring, recurrence_rule, installment_number, installment_total, source_type, external_provider, external_transaction_id, external_account_id, imported_at, last_synced_at, metadata, created_by, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createResult(data, error = null) {
  return {
    data,
    error,
    isConfigured: isSupabaseConfigured,
  };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
  });
}

function createValidationResult(message) {
  return createResult(null, {
    code: 'INVALID_TRANSACTION_REQUEST',
    message,
  });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function pickDefined(source, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => source[field] !== undefined)
      .map((field) => [field, source[field]]),
  );
}

function normalizeSingleResult(data, error, message) {
  if (!error && !data) {
    return createResult(null, {
      code: 'TRANSACTION_NOT_FOUND',
      message,
    });
  }

  return createResult(data, error);
}

function hasRequiredTransactionFields(transaction) {
  const normalizedAmount = Number(transaction.amount);

  return Boolean(
    transaction.account_id &&
      transaction.transaction_type &&
      typeof transaction.description === 'string' &&
      transaction.description.trim() &&
      transaction.amount !== undefined &&
      Number.isFinite(normalizedAmount) &&
      normalizedAmount > 0 &&
      transaction.transaction_date,
  );
}

export async function listTransactions(
  workspaceId,
  {
    accountId,
    categoryId,
    status,
    transactionType,
    dateFrom,
    dateTo,
    limit = 50,
  } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }
  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar transacoes.');
  }
  if (accountId && !isValidUuid(accountId)) {
    return createValidationResult('Conta invalida para filtrar transacoes.');
  }
  if (categoryId && !isValidUuid(categoryId)) {
    return createValidationResult('Categoria invalida para filtrar transacoes.');
  }

  const normalizedLimit = Math.floor(
    Math.min(Math.max(Number(limit) || 50, 1), 100),
  );
  let query = supabase
    .from('transactions')
    .select(TRANSACTION_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(normalizedLimit);

  if (accountId) {
    query = query.eq('account_id', accountId);
  }
  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (transactionType) {
    query = query.eq('transaction_type', transactionType);
  }
  if (dateFrom) {
    query = query.gte('transaction_date', dateFrom);
  }
  if (dateTo) {
    query = query.lte('transaction_date', dateTo);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getTransaction(workspaceId, transactionId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }
  if (!isValidUuid(workspaceId) || !isValidUuid(transactionId)) {
    return createValidationResult('Workspace ou transacao invalida.');
  }

  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', transactionId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Transacao nao encontrada.');
}

export async function createTransaction(workspaceId, transaction = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }
  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para criar a transacao.');
  }

  if (!isValidUuid(transaction.account_id)) {
    return createValidationResult('Conta de origem invalida.');
  }
  if (
    transaction.destination_account_id &&
    !isValidUuid(transaction.destination_account_id)
  ) {
    return createValidationResult('Conta de destino invalida.');
  }

  if (transaction.category_id && !isValidUuid(transaction.category_id)) {
    return createValidationResult('Categoria invalida.');
  }

  if (!hasRequiredTransactionFields(transaction)) {
    return createValidationResult(
      'Conta, tipo, descricao, valor positivo e data sao obrigatorios.',
    );
  }

  const payload = {
    workspace_id: workspaceId,
    ...pickDefined(transaction, [
      'account_id',
      'destination_account_id',
      'category_id',
      'transaction_type',
      'description',
      'amount',
      'transaction_date',
      'competence_date',
      'status',
      'payment_method',
      'notes',
      'is_recurring',
      'recurrence_rule',
      'installment_number',
      'installment_total',
      'metadata',
    ]),
    description: transaction.description.trim(),
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert(payload)
    .select(TRANSACTION_FIELDS)
    .single();

  return createResult(data, error);
}

export function buildTransactionUpdatePayload(changes = {}) {
  return pickDefined(changes, [
    'account_id',
    'destination_account_id',
    'category_id',
    'transaction_type',
    'description',
    'amount',
    'transaction_date',
    'competence_date',
    'status',
    'payment_method',
    'notes',
    'is_recurring',
    'recurrence_rule',
    'installment_number',
    'installment_total',
    'metadata',
  ]);
}

export async function updateTransaction(
  workspaceId,
  transactionId,
  changes = {},
) {
  if (!supabase) {
    return createUnavailableResult(null);
  }
  if (!isValidUuid(workspaceId) || !isValidUuid(transactionId)) {
    return createValidationResult('Workspace ou transacao invalida.');
  }

  for (const field of [
    'account_id',
    'destination_account_id',
    'category_id',
  ]) {
    if (changes[field] && !isValidUuid(changes[field])) {
      return createValidationResult(`Identificador invalido em ${field}.`);
    }
  }

  if (changes.amount !== undefined) {
    const normalizedAmount = Number(changes.amount);

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return createValidationResult('O valor da transacao deve ser positivo.');
    }
  }

  const payload = buildTransactionUpdatePayload(changes);

  if (typeof payload.description === 'string') {
    payload.description = payload.description.trim();
  } else if (payload.description !== undefined) {
    return createValidationResult('A descricao deve ser um texto valido.');
  }

  if (Object.keys(payload).length === 0 || payload.description === '') {
    return createValidationResult('Nenhuma alteracao valida foi informada.');
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', transactionId)
    .select(TRANSACTION_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(
    data,
    error,
    'Transacao nao encontrada para atualizacao.',
  );
}

export async function deleteTransaction(workspaceId, transactionId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }
  if (!isValidUuid(workspaceId) || !isValidUuid(transactionId)) {
    return createValidationResult('Workspace ou transacao invalida.');
  }

  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', transactionId)
    .select('id')
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Transacao nao encontrada para exclusao.');
}
