import { useEffect, useMemo } from 'react';
import { useSession } from '../../app/SessionContext';
import { useAccounts, useFinancialBalances, useTransactions, useWorkspaceRole } from '../../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { getMonthRange } from '../simplified-app/simplifiedRecordsData.js';
import { permissoesDaConta } from './contasOrganizar.js';

const SEM_REGISTROS = Object.freeze([]);

// Dados das telas de Contas do Organizar: contas do espaço, saldo derivado
// pela RPC, o papel da pessoa no espaço e, com `comLancamentos`, os
// lançamentos concluídos do mês (só o detalhe lê; a lista não paga a busca).
// Um ajuste de saldo ou lançamento feito em outra tela avisa pelo evento
// financeiro e as fontes recarregam.
export function useContasOrganizar({ comLancamentos = false } = {}) {
  const { user, workspace } = useSession();
  const mes = useMemo(() => getMonthRange(new Date()), []);
  const accountState = useAccounts({
    workspaceId: workspace?.id,
    fallbackAccounts: SEM_REGISTROS,
    fallbackAccountTypes: SEM_REGISTROS,
  });
  const balanceState = useFinancialBalances({ workspaceId: workspace?.id });
  const transactionState = useTransactions({
    workspaceId: comLancamentos ? workspace?.id : undefined,
    dateFrom: mes.dateFrom,
    dateTo: mes.dateTo,
    status: 'completed',
  });
  const role = useWorkspaceRole({
    workspaceId: workspace?.id,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });

  const { refresh: refreshAccounts } = accountState;
  const { refresh: refreshBalances } = balanceState;
  const { refresh: refreshTransactions } = transactionState;

  useEffect(() => {
    function handleDataChanged(event) {
      if (event.detail?.source === 'organizar-contas') return;
      void Promise.all([
        refreshAccounts(),
        refreshBalances(),
        comLancamentos ? refreshTransactions() : null,
      ]);
    }
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
  }, [comLancamentos, refreshAccounts, refreshBalances, refreshTransactions]);

  const podeCriar = role.canUpdate === true && !role.isLoading && !accountState.isMutating;
  const permissoes = (conta) => permissoesDaConta(conta, role);

  return {
    mes,
    accountState,
    balanceState,
    transactionState,
    podeCriar,
    permissoes,
    carregandoPapel: role.isLoading,
    carregando: accountState.isLoading || balanceState.isLoading,
  };
}
