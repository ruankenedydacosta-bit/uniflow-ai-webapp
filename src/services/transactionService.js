import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const TRANSACTION_FIELDS =
  'id, workspace_id, account_id, destination_account_id, category_id, transaction_type, description, amount, adjustment_delta, adjustment_target, transaction_date, competence_date, status, payment_method, notes, is_recurring, recurrence_rule, installment_number, installment_total, source_type, external_provider, external_transaction_id, external_account_id, imported_at, last_synced_at, metadata, created_by, created_at, updated_at';
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

  // Descrição NUNCA é obrigatória aqui -- a UI já resolve um valor honesto
  // (ver resolveTransactionDescription em transactionFormUtils.js) antes de
  // chamar este serviço, mas o service em si não deve barrar um chamador
  // que não a preencha. A coluna description no banco continua NOT NULL +
  // não-vazia; normalizeTransactionDescription (abaixo) garante um valor
  // válido antes do insert/update em vez de rejeitar a chamada aqui.
  //
  // CONTA-OPCIONAL: account_id só é obrigatório para transferência (precisa
  // de origem) e ajuste de saldo (o delta muda o saldo de UMA conta
  // específica). Entrada/despesa passam a poder ser salvas sem conta --
  // meses de atrito real vinham exatamente da exigência de conta nesses dois
  // tipos, que é a maioria dos lançamentos do dia a dia.
  const accountRequired = transaction.transaction_type === 'transfer'
    || transaction.transaction_type === 'adjustment';
  return Boolean(
    (!accountRequired || transaction.account_id) &&
      transaction.transaction_type &&
      transaction.amount !== undefined &&
      Number.isFinite(normalizedAmount) &&
      normalizedAmount > 0 &&
      transaction.transaction_date,
  );
}

// Mesmo fallback neutro/honesto usado no formulário (transactionFormUtils.js)
// -- última linha de defesa para nunca falhar a constraint NOT NULL/não-vazia
// de transactions.description mesmo se um chamador futuro não usar a UI.
const NEUTRAL_DESCRIPTION_BY_TYPE = {
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência entre contas',
  adjustment: 'Ajuste de saldo',
};

function normalizeTransactionDescription(transaction) {
  const trimmed = typeof transaction.description === 'string' ? transaction.description.trim() : '';
  return trimmed || NEUTRAL_DESCRIPTION_BY_TYPE[transaction.transaction_type] || 'Lançamento';
}

const PERIOD_PAGE_SIZE = 500;
// Teto de seguranca contra loop infinito (ex.: resposta inesperada do
// backend) -- nao e um limite funcional: 100 paginas x 500 linhas cobrem
// 50.000 transacoes num unico periodo, muito acima do volume real de
// qualquer janela de relatorio.
const PERIOD_MAX_PAGES = 100;

/**
 * Orquestra paginas sucessivas de `fetchPage(offset, pageSize)` ate uma
 * pagina retornar menos linhas que `pageSize` (fim dos dados) ou o teto de
 * seguranca ser atingido. Funcao pura de orquestracao -- nao conhece
 * Supabase, apenas acumula o que `fetchPage` devolve; por isso e testavel
 * isoladamente com uma funcao falsa, sem depender de um Supabase real
 * configurado (diferente do resto deste arquivo, que so roda com
 * `supabase` presente).
 */
export async function fetchAllPages(
  fetchPage,
  { pageSize = PERIOD_PAGE_SIZE, maxPages = PERIOD_MAX_PAGES } = {},
) {
  const allData = [];
  let page = 0;

  while (page < maxPages) {
    const offset = page * pageSize;
    const { data, error } = await fetchPage(offset, pageSize);

    if (error) {
      return { data: allData, error };
    }

    allData.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      break;
    }

    page += 1;
  }

  return { data: allData, error: null };
}

/**
 * Busca TODAS as transacoes de um periodo (paginacao interna via
 * fetchAllPages/.range()), ao contrario de listTransactions (que sempre
 * limita a `limit` linhas mais recentes, no maximo 100). Existe para
 * consumidores que precisam agregar um intervalo de datas completo -- hoje
 * apenas Relatorios (useReports.js) -- nunca para a lista recente exibida
 * em Financeiro/Uni/Dashboard, que continuam usando listTransactions
 * inalterado. dateFrom/dateTo comparam a coluna `date` transaction_date
 * diretamente (sem hora, sem timezone). status filtra exatamente como em
 * listTransactions.
 */
export async function listTransactionsForPeriod(
  workspaceId,
  { dateFrom, dateTo, status } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }
  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar transacoes do periodo.');
  }

  const { data, error } = await fetchAllPages((offset, pageSize) => {
    let query = supabase
      .from('transactions')
      .select(TRANSACTION_FIELDS)
      .eq('workspace_id', workspaceId)
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (dateFrom) {
      query = query.gte('transaction_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('transaction_date', dateTo);
    }

    return query;
  });

  return createResult(data ?? [], error);
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

  // CONTA-OPCIONAL: account_id só precisa ser um UUID valido quando
  // presente. Ausencia (null/undefined) e' aceita para entrada/despesa;
  // hasRequiredTransactionFields (abaixo) e' quem decide se o TIPO da
  // transacao exige conta (transferencia/ajuste continuam exigindo).
  if (transaction.account_id != null && !isValidUuid(transaction.account_id)) {
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
    const accountRequired = transaction.transaction_type === 'transfer'
      || transaction.transaction_type === 'adjustment';
    return createValidationResult(
      accountRequired
        ? 'Conta, tipo, valor positivo e data sao obrigatorios.'
        : 'Tipo, valor positivo e data sao obrigatorios.',
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
      'adjustment_delta',
      'adjustment_target',
      'metadata',
    ]),
    description: normalizeTransactionDescription(transaction),
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
    'adjustment_delta',
    'adjustment_target',
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

  // Descrição em branco nunca bloqueia a edição -- mesmo fallback neutro
  // usado na criação (normalizeTransactionDescription), nunca uma rejeição.
  if (payload.description !== undefined) {
    payload.description = normalizeTransactionDescription({
      description: payload.description,
      transaction_type: payload.transaction_type,
    });
  }

  if (Object.keys(payload).length === 0) {
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
