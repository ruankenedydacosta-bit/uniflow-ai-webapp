import { useEffect, useMemo } from 'react';
import { useSession } from '../../app/SessionContext';
import { useAccounts, useFinancialBalances, useTransactions, useWorkspaceRole } from '../../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { getMonthRange } from '../simplified-app/simplifiedRecordsData.js';
import { ehCartao, periodoDosCartoes, permissoesDaConta } from './contasOrganizar.js';

const SEM_REGISTROS = Object.freeze([]);

// Dados das telas de Contas do Organizar: contas do espaço, saldo derivado
// pela RPC, o papel da pessoa no espaço e, com `comLancamentos`, os
// lançamentos concluídos do mês (só o detalhe lê; a lista não paga a busca).
// Com `comCartoes` (true para todos os cartões, ou o id de um só), busca à
// parte os lançamentos do ciclo aberto dos cartões (que pode começar no mês
// anterior) para a fatura aberta.
// Um ajuste de saldo ou lançamento feito em outra tela avisa pelo evento
// financeiro e as fontes recarregam.
export function useContasOrganizar({ comLancamentos = false, comCartoes = false } = {}) {
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
  const periodoCartoes = useMemo(
    () => (comCartoes
      ? periodoDosCartoes(
        accountState.accounts.filter((conta) => ehCartao(conta)
          && conta.is_active !== false
          && (comCartoes === true || conta.id === comCartoes)),
        mes.date,
      )
      : null),
    [comCartoes, accountState.accounts, mes.date],
  );
  const cartoesState = useTransactions({
    workspaceId: periodoCartoes ? workspace?.id : undefined,
    dateFrom: periodoCartoes?.dateFrom,
    dateTo: periodoCartoes?.dateTo,
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
  const { refresh: refreshCartoes } = cartoesState;

  useEffect(() => {
    function handleDataChanged(event) {
      if (event.detail?.source === 'organizar-contas') return;
      void Promise.all([
        refreshAccounts(),
        refreshBalances(),
        comLancamentos ? refreshTransactions() : null,
        periodoCartoes ? refreshCartoes() : null,
      ]);
    }
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
  }, [comLancamentos, periodoCartoes, refreshAccounts, refreshBalances, refreshTransactions, refreshCartoes]);

  const podeCriar = role.canUpdate === true && !role.isLoading && !accountState.isMutating;
  const permissoes = (conta) => permissoesDaConta(conta, role);

  return {
    mes,
    accountState,
    balanceState,
    transactionState,
    // Lançamentos do ciclo aberto dos cartões; vazio sem `comCartoes`.
    cartoesState,
    // Sem período (nenhum cartão) o useTransactions responde WORKSPACE_REQUIRED:
    // isso não é erro para a tela. E entre o período aparecer e a busca
    // começar, esse mesmo código ainda está lá: a tela segue carregando.
    carregandoCartoes: Boolean(periodoCartoes)
      && (cartoesState.isLoading || cartoesState.error?.code === 'WORKSPACE_REQUIRED'),
    erroCartoes: Boolean(periodoCartoes) && cartoesState.error && cartoesState.error.code !== 'WORKSPACE_REQUIRED'
      ? cartoesState.error
      : null,
    podeCriar,
    permissoes,
    carregandoPapel: role.isLoading,
    carregando: accountState.isLoading || balanceState.isLoading,
  };
}
