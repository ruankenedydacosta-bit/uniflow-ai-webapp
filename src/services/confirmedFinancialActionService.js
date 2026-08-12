import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { notifyFinancialDataChanged } from './financialDataEvents.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RPC_ERROR_MESSAGES = Object.freeze({
  financial_action_session_required: ['SESSION_REQUIRED', 'Sua sessão expirou. Entre novamente antes de registrar.'],
  financial_action_workspace_required: ['WORKSPACE_REQUIRED', 'Selecione um espaço financeiro antes de continuar.'],
  financial_action_workspace_forbidden: ['WORKSPACE_FORBIDDEN', 'Você não tem permissão para registrar neste espaço.'],
  financial_action_idempotency_required: ['IDEMPOTENCY_REQUIRED', 'Não consegui validar esta confirmação. Tente novamente.'],
  financial_action_idempotency_conflict: ['IDEMPOTENCY_CONFLICT', 'Esta confirmação não corresponde mais ao lançamento original. Revise e confirme novamente.'],
  financial_action_account_archived: ['ACCOUNT_ARCHIVED', 'Essa conta está arquivada. Revise sua escolha antes de continuar.'],
  financial_action_account_not_archived: ['ACCOUNT_NOT_ARCHIVED', 'Essa conta já está ativa. Revise sua escolha antes de continuar.'],
  financial_action_account_duplicate: ['ACCOUNT_DUPLICATE', 'Já existe uma conta ativa equivalente neste espaço.'],
  financial_action_account_forbidden: ['ACCOUNT_FORBIDDEN', 'A conta escolhida não pertence ao espaço atual.'],
  financial_action_account_type_invalid: ['ACCOUNT_TYPE_INVALID', 'O tipo de conta escolhido não está disponível.'],
  financial_action_category_invalid: ['CATEGORY_INVALID', 'A categoria escolhida não é válida para este lançamento.'],
  financial_action_amount_invalid: ['AMOUNT_INVALID', 'Revise o valor antes de confirmar.'],
  financial_action_date_invalid: ['DATE_INVALID', 'Revise a data antes de confirmar.'],
  financial_action_destination_invalid: ['DESTINATION_INVALID', 'Revise a conta de destino antes de confirmar.'],
  financial_action_type_invalid: ['TYPE_INVALID', 'O tipo de lançamento escolhido não é suportado.'],
  financial_action_adjustment_delta_invalid: ['ADJUSTMENT_DELTA_INVALID', 'Revise o valor do ajuste antes de confirmar.'],
});

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function createSafeError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const match = Object.entries(RPC_ERROR_MESSAGES)
    .find(([token]) => message.includes(token));

  if (match) {
    return { code: match[1][0], message: match[1][1] };
  }
  if (error?.code === '23505') {
    return { code: 'DUPLICATE_ACTION', message: 'Essa ação já foi processada ou a conta já existe.' };
  }

  return {
    code: 'ATOMIC_FINANCIAL_ACTION_FAILED',
    message: 'Não consegui concluir esse lançamento agora. Nada foi registrado e você pode tentar novamente.',
  };
}

export function getConfirmedAccountMode(action) {
  if (action?.accountResolution?.provisioning === 'reactivate') return 'reactivate';
  if (action?.accountResolution?.status === 'will_create') return 'create';
  // CONTA-OPCIONAL: receita/despesa chegam a 'ready' sem conta quando nenhuma
  // foi resolvida sem ambiguidade -- a RPC precisa saber disso explicitamente
  // (modo 'none'), nunca receber mode='existing' com account_id null.
  if (!action?.account?.id) return 'none';
  return 'existing';
}

export function buildConfirmedFinancialActionRpcPayload(action) {
  const clientOperationId = action?.clientOperationId;
  if (!UUID_PATTERN.test(clientOperationId ?? '')) {
    return { data: null, error: { code: 'INVALID_OPERATION_ID', message: 'Confirmação inválida para este lançamento.' } };
  }
  if (action?.status !== 'ready' || !action?.payload) {
    return { data: null, error: { code: 'ACTION_NOT_READY', message: 'Revise os dados antes de confirmar.' } };
  }

  const accountMode = getConfirmedAccountMode(action);
  const proposedAccount = action.proposedAccount ?? {};
  return {
    data: {
      p_client_operation_id: clientOperationId,
      p_account_mode: accountMode,
      p_account_id: accountMode === 'create' ? null : action.account?.id ?? null,
      p_account_name: accountMode === 'create' ? proposedAccount.name ?? null : null,
      p_account_type: accountMode === 'create' ? proposedAccount.account_type ?? null : null,
      p_account_institution_name:
        accountMode === 'create' ? proposedAccount.institution_name ?? null : null,
      p_category_id: action.category?.id ?? action.payload.category_id ?? null,
      p_transaction_type: action.payload.transaction_type,
      p_description: action.payload.description,
      p_amount: action.payload.amount,
      p_transaction_date: action.payload.transaction_date,
      p_destination_account_id: action.payload.destination_account_id ?? null,
      p_adjustment_delta: action.payload.adjustment_delta ?? null,
      // BLOCO SALDO/RECEITA/DESPESA EDITAVEIS: só preenchido em ajustes
      // (transaction_type 'adjustment'); null/'balance' corrige o saldo
      // total (comportamento original), 'income'/'expense' corrige
      // especificamente o total de Receita/Despesa do mês.
      p_adjustment_target: action.payload.adjustment_target ?? null,
    },
    error: null,
  };
}

export async function executeConfirmedFinancialAction(action) {
  if (!supabase) {
    return createResult(null, {
      code: 'SUPABASE_NOT_CONFIGURED',
      message: 'O modo demo continua disponível sem conexão remota.',
    });
  }

  const request = buildConfirmedFinancialActionRpcPayload(action);
  if (request.error) return createResult(null, request.error);

  const { data, error } = await supabase
    .rpc('execute_confirmed_financial_action', request.data)
    .single();

  // CONTA-OPCIONAL: account_id agora pode ser null de verdade (receita/
  // despesa sem conta) -- só transaction_id é obrigatório para sucesso.
  if (error || !data?.transaction_id) {
    return createResult(null, createSafeError(error));
  }

  notifyFinancialDataChanged('confirmed-financial-action');
  const accountSource = action.account ?? action.proposedAccount ?? {};
  return {
    ...createResult({
      id: data.transaction_id,
      account_id: data.account_id ?? null,
      account_created: Boolean(data.account_created),
      account_reactivated: Boolean(data.account_reactivated),
      idempotent_replay: Boolean(data.idempotent_replay),
    }),
    account: data.account_id
      ? {
          ...accountSource,
          id: data.account_id,
          is_active: true,
        }
      : null,
  };
}
