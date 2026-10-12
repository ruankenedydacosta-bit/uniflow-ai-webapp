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

const SCHEDULED_TRANSACTION_FIELDS =
  'id, description, transaction_type, status, transaction_date, created_at, updated_at';

/**
 * Contas da Agenda: despesas e receitas previstas (status pending) do
 * período, só com os campos que a projeção usa.
 */
export async function listScheduledTransactionCandidates(
  workspaceId,
  { dateFrom, dateTo } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }
  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar contas da agenda.');
  }

  const { data, error } = await fetchAllPages((offset, pageSize) => {
    let query = supabase
      .from('transactions')
      .select(SCHEDULED_TRANSACTION_FIELDS)
      .eq('workspace_id', workspaceId)
      .in('transaction_type', ['expense', 'income'])
      .eq('status', 'pending')
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

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

// expectedUpdatedAt: só grava se o lançamento ainda estiver como foi lido.
// Sem linha afetada, devolve TRANSACTION_CHANGED: alguém editou no meio.
export async function updateTransaction(
  workspaceId,
  transactionId,
  changes = {},
  { expectedUpdatedAt = null } = {},
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

  let query = supabase
    .from('transactions')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', transactionId);
  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt);
  }
  const { data, error } = await query
    .select(TRANSACTION_FIELDS)
    .maybeSingle();

  if (expectedUpdatedAt && !error && !data) {
    return createResult(null, {
      code: 'TRANSACTION_CHANGED',
      message: 'O lancamento mudou ou nao existe mais.',
    });
  }

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

// Lançamento recorrente (#222): a série e o alcance "esta e as próximas" ou
// "todas" vão por RPC, porque as ocorrências futuras nem sempre estão na
// lista carregada e a regra da série muda junto.
const SERIES_ERROR_MESSAGES = Object.freeze({
  recurring_series_rule_invalid: 'Revise a frequência, o intervalo e a data final da repetição.',
  recurring_series_too_many: 'A repetição começa muito antes de hoje. Use uma data de início mais recente.',
  recurring_series_scope_invalid: 'Escolha a quais lançamentos da série a mudança vale.',
  recurring_series_not_found: 'Esse lançamento não faz mais parte de uma série. Atualize a lista.',
  financial_action_category_invalid: 'Escolha uma categoria do mesmo tipo do lançamento.',
  financial_action_account_forbidden: 'A conta escolhida não está ativa neste espaço.',
  financial_action_workspace_forbidden: 'Você não tem permissão para mudar esta série.',
  financial_action_amount_invalid: 'O valor precisa ser maior que zero.',
  financial_action_description_invalid: 'A descrição precisa ter de 2 a 160 caracteres.',
});

function createSeriesResult(data, error) {
  if (!error) return createResult(data, null);
  const token = Object.keys(SERIES_ERROR_MESSAGES).find((key) => error.message?.includes(key));
  return token ? createValidationResult(SERIES_ERROR_MESSAGES[token]) : createResult(null, error);
}

export async function createRecurringSeries(series = {}) {
  if (!supabase) return createUnavailableResult(null);
  const { data, error } = await supabase
    .rpc('criar_serie_recorrente', {
      p_client_operation_id: series.clientOperationId ?? null,
      p_transaction_type: series.transaction_type,
      p_account_id: series.account_id || null,
      p_category_id: series.category_id || null,
      p_description: series.description,
      p_amount: Number(series.amount),
      p_frequency: series.frequency,
      p_interval: Number(series.interval),
      p_start_date: series.start_date,
      p_end_date: series.end_date || null,
      p_auto_confirm: Boolean(series.auto_confirm),
      p_payment_method: series.payment_method ?? null,
      p_notes: series.notes ?? null,
    })
    .single();
  return createSeriesResult(data ?? null, error);
}

export async function updateSeriesTransactions(transactionId, scope, changes = {}) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(transactionId)) return createValidationResult('Lançamento inválido.');
  const { data, error } = await supabase.rpc('alterar_lancamentos_da_serie', {
    p_transaction_id: transactionId,
    p_scope: scope,
    p_account_id: changes.account_id || null,
    p_category_id: changes.category_id || null,
    p_description: changes.description,
    p_amount: Number(changes.amount),
    p_payment_method: changes.payment_method ?? null,
    p_notes: changes.notes ?? null,
  });
  return createSeriesResult(data ?? 0, error);
}

export async function deleteSeriesTransactions(transactionId, scope) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(transactionId)) return createValidationResult('Lançamento inválido.');
  const { data, error } = await supabase.rpc('excluir_lancamentos_da_serie', {
    p_transaction_id: transactionId,
    p_scope: scope,
  });
  return createSeriesResult(data ?? 0, error);
}
