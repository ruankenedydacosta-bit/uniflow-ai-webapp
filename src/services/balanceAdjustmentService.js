// BLOCO FINAL DO MVP (Saldo manual) -- reaproveita integralmente o mecanismo
// já existente e validado de "ajuste de saldo" (transaction_type =
// 'adjustment' + adjustment_delta + RPC execute_confirmed_financial_action,
// migration 20260731_027_balance_adjustments.sql), criado originalmente para
// o fluxo "Meu saldo no Nubank é R$ 1.000" da Uni. Nenhuma tabela, coluna ou
// tipo de transação novos são necessários -- este arquivo só monta o payload
// e delega para executeConfirmedFinancialAction, que já garante isolamento
// de workspace, idempotência e validação atômica.
import { executeConfirmedFinancialAction } from './confirmedFinancialActionService.js';

// BLOCO SALDO/RECEITA/DESPESA EDITAVEIS: mesmo mecanismo, agora com 3 alvos
// possíveis -- 'balance' (saldo total do workspace, comportamento
// original), 'income' e 'expense' (total de Receita/Despesa do MÊS em que
// a correção é datada, ver adjustment_target/migration 038). O usuário
// informa o total que o card deveria mostrar; a diferença vira um
// lançamento de ajuste que corrige o total sem apagar o histórico real.
const DEFAULT_DESCRIPTION_BY_TARGET = Object.freeze({
  balance: 'Ajuste manual de saldo',
  income: 'Ajuste manual de entrada',
  expense: 'Ajuste manual de saída',
});
// A RPC exige description com 2 a 160 caracteres (btrim). Reservamos espaço
// para o prefixo fixo + separador antes de truncar a nota do usuário.
const MAX_DESCRIPTION_LENGTH = 160;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function buildAdjustmentDescription(note, target = 'balance') {
  const defaultDescription = DEFAULT_DESCRIPTION_BY_TARGET[target] ?? DEFAULT_DESCRIPTION_BY_TARGET.balance;
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  if (!trimmedNote) return defaultDescription;

  const combined = `${defaultDescription} — ${trimmedNote}`;
  return combined.length > MAX_DESCRIPTION_LENGTH
    ? combined.slice(0, MAX_DESCRIPTION_LENGTH)
    : combined;
}

// CONTA-OPCIONAL (fase 2): accountId deixou de ser obrigatorio -- o ajuste
// corrige o total do WORKSPACE (saldo) ou do MÊS (receita/despesa), nunca o
// saldo de uma conta específica escolhida na tela. Quando accountId não é
// informado, o ajuste é criado sem conta associada (account_id null).
export async function submitBalanceAdjustment({
  accountId = null,
  target = 'balance',
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
        message: 'O novo valor é igual ao valor atual — nada para ajustar.',
      },
    };
  }

  const action = {
    clientOperationId,
    status: 'ready',
    payload: {
      transaction_type: 'adjustment',
      description: buildAdjustmentDescription(note, target),
      amount: Math.abs(delta),
      transaction_date: todayIso(),
      adjustment_delta: delta,
      adjustment_target: target === 'balance' ? null : target,
      category_id: null,
      destination_account_id: null,
    },
    account: { id: accountId },
  };

  const result = await executeConfirmedFinancialAction(action);
  return { ...result, delta };
}
