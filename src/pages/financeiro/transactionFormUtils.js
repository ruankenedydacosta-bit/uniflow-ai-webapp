import { toDateKey } from '../../features/simplified-app/simplifiedAgendaCalendar.js';
import { buildInstallmentPayloads, validateInstallmentCount } from './installmentUtils.js';
import { buildRecurrenceRule } from './recurrenceUtils.js';

// Data de hoje no relógio da pessoa (yyyy-mm-dd). toISOString() usa UTC e,
// depois das 21h em Brasília, já devolve o dia seguinte.
export function localDateKey(date = new Date()) {
  return toDateKey(date);
}

export function createEmptyTransactionForm(transactionType = 'expense') {
  return {
    account_id: '',
    destination_account_id: '',
    category_id: '',
    transaction_type: transactionType,
    description: '',
    amount: '',
    transaction_date: localDateKey(),
    status: 'completed',
    auto_confirm: false,
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
    auto_confirm: Boolean(transaction.metadata?.auto_confirm),
    // Guarda o metadata atual: o update troca o jsonb inteiro.
    metadata_base: transaction.metadata ?? null,
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
    transaction_date: localDateKey(),
    status: 'completed',
    auto_confirm: false,
    payment_method: transaction.payment_method ?? '',
    notes: transaction.notes ?? '',
    installment_count: 1,
    is_recurring: false,
    recurrence_frequency: 'monthly',
    recurrence_interval: 1,
    recurrence_end_date: '',
  };
}

// Rótulos honestos por tipo -- mesmos já usados em transactionExportUtils.js
// (TRANSACTION_TYPE_LABELS), reaproveitados aqui como base do fallback.
const NEUTRAL_DESCRIPTION_BY_TYPE = {
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência entre contas',
  adjustment: 'Ajuste de saldo',
};

// A descrição é OPCIONAL na interface (usuário nunca é obrigado a digitar),
// mas a coluna transactions.description no banco é NOT NULL + CHECK
// length(btrim(description)) > 0 (supabase/migrations/20260711000200_002_financial_core.sql).
// Em vez de relaxar essa constraint (migração não comprovadamente
// necessária) ou forçar o usuário a preencher, sintetizamos aqui uma
// descrição neutra e honesta (nunca inventa detalhes) só para persistência
// quando o campo é deixado em branco.
export function resolveTransactionDescription(form) {
  const typed = form.description?.trim();
  if (typed) return typed;
  return NEUTRAL_DESCRIPTION_BY_TYPE[form.transaction_type] ?? 'Lançamento';
}

// Data depois de hoje grava 'pending' (previsto); hoje ou passada mantém o
// status do formulário. Um previsto vencido continua 'pending' até a pessoa
// confirmar, então editar a descrição dele não o transforma em realizado.
export function resolveTransactionStatus(form, today = localDateKey()) {
  if (form.status === 'canceled' || form.status === 'failed') return form.status;
  if (String(form.transaction_date) > String(today)) return 'pending';
  return form.status ?? 'completed';
}

// "Confirmar automaticamente na data" vive em metadata.auto_confirm e só
// vale para previsto. Sem mudança no metadata, a chave fica de fora do
// payload para o update não tocar nele.
export function resolveTransactionMetadata(form, status) {
  const base = form.metadata_base ?? null;
  const wantsAuto = status === 'pending' && Boolean(form.auto_confirm);
  if (wantsAuto) return { ...(base ?? {}), auto_confirm: true };
  if (base && 'auto_confirm' in base) {
    const resto = { ...base };
    delete resto.auto_confirm;
    return resto;
  }
  return undefined;
}

export function buildTransactionMutationPayload(form, today) {
  const payload = {
    // CONTA-OPCIONAL: '' (valor inicial do campo, ou form de um tipo que não
    // mostra mais "Conta") precisa virar null -- string vazia não é um UUID
    // válido e seria rejeitada por isValidUuid em transactionService.js.
    account_id: form.account_id || null,
    destination_account_id:
      form.transaction_type === 'transfer' ? form.destination_account_id : null,
    category_id: form.category_id || null,
    transaction_type: form.transaction_type,
    description: resolveTransactionDescription(form),
    amount: form.amount,
    transaction_date: form.transaction_date,
    status: resolveTransactionStatus(form, today),
    payment_method: form.payment_method?.trim() ? form.payment_method.trim() : null,
    notes: form.notes?.trim() ? form.notes.trim() : null,
  };

  const metadata = resolveTransactionMetadata(form, payload.status);
  if (metadata !== undefined) payload.metadata = metadata;

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
  // As parcelas futuras nascem previstas, mesmo se a primeira for de hoje.
  if (form.auto_confirm && resolveTransactionStatus(form) === 'pending') {
    basePayload.metadata = { ...(basePayload.metadata ?? {}), auto_confirm: true };
  }
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
