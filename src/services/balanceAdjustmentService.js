// BLOCO FINAL DO MVP (Saldo manual) -- reaproveita integralmente o mecanismo
// já existente e validado de "ajuste de saldo" (transaction_type =
// 'adjustment' + adjustment_delta + RPC execute_confirmed_financial_action,
// migration 20260731_027_balance_adjustments.sql), criado originalmente para
// o fluxo "Meu saldo no Nubank é R$ 1.000" da Uni. Nenhuma tabela, coluna ou
// tipo de transação novos são necessários -- este arquivo só monta o payload
// e delega para executeConfirmedFinancialAction, que já garante isolamento
// de workspace, idempotência e validação atômica.
import { executeConfirmedFinancialAction } from './confirmedFinancialActionService.js';

const DEFAULT_DESCRIPTION = 'Ajuste manual de saldo';
// A RPC exige description com 2 a 160 caracteres (btrim). Reservamos espaço
// para o prefixo fixo + separador antes de truncar a nota do usuário.
const MAX_DESCRIPTION_LENGTH = 160;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function buildAdjustmentDescription(note) {
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  if (!trimmedNote) return DEFAULT_DESCRIPTION;

  const combined = `${DEFAULT_DESCRIPTION} — ${trimmedNote}`;
  return combined.length > MAX_DESCRIPTION_LENGTH
    ? combined.slice(0, MAX_DESCRIPTION_LENGTH)
    : combined;
}

// CONTA-OPCIONAL (fase 2): accountId deixou de ser obrigatorio -- "Atualizar
// saldo" ajusta o saldo TOTAL do workspace (get_derived_workspace_balance()),
// nao mais o saldo de uma conta especifica escolhida pelo usuario. Quando
// accountId nao e informado, o ajuste e criado sem conta associada
// (account_id null), incluido no saldo total pela mesma RPC.
export async function submitBalanceAdjustment({
  accountId = null,
  currentBalance,
  newBalance,
  note,
  clientOperationId,
}) {
  const delta = Math.round((Number(newBalance) - Number(currentBalance)) * 100) / 100;
  if (!delta) {
    return {
      data: null,
      error: {
        code: 'ADJUSTMENT_DELTA_INVALID',
        message: 'O novo saldo é igual ao saldo atual — nada para ajustar.',
      },
    };
  }

  const action = {
    clientOperationId,
    status: 'ready',
    payload: {
      transaction_type: 'adjustment',
      description: buildAdjustmentDescription(note),
      amount: Math.abs(delta),
      transaction_date: todayIso(),
      adjustment_delta: delta,
      category_id: null,
      destination_account_id: null,
    },
    account: { id: accountId },
  };

  const result = await executeConfirmedFinancialAction(action);
  return { ...result, delta };
}
