import { useMemo } from 'react';
import { useSession } from '../../app/SessionContext';
import { useCategories, useTransactions, useWorkspaceRole } from '../../hooks';
import { getMonthRange } from '../simplified-app/simplifiedRecordsData.js';
import { canManageCategory } from './categoryUtils.js';

// Dados das telas de Categorias do Organizar: categorias do espaço pessoal
// (como em Financeiro), lançamentos concluídos do mês e a permissão de
// gerenciar cada categoria.
export function useCategoriasOrganizar() {
  const { user, workspace } = useSession();
  const mes = useMemo(() => getMonthRange(new Date()), []);
  const categoryState = useCategories({ workspaceId: workspace?.id, context: 'personal' });
  const transactionState = useTransactions({
    workspaceId: workspace?.id,
    dateFrom: mes.dateFrom,
    dateTo: mes.dateTo,
    status: 'completed',
  });
  const role = useWorkspaceRole({
    workspaceId: workspace?.id,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });

  const podeCriar = role.canUpdate === true && !role.isLoading && !categoryState.isMutating;
  // Ocultar e mostrar seguem as policies de workspace_hidden_categories
  // (owner, admin e member), as mesmas de criar categoria.
  const podeOcultar = role.canUpdate === true && !role.isLoading;
  const podeGerenciar = (categoria) => !role.isLoading && canManageCategory(categoria, {
    canUpdate: role.canUpdate,
    canDelete: role.canDelete,
    userId: user?.id,
  });

  return {
    mes,
    categoryState,
    transactionState,
    podeCriar,
    podeOcultar,
    podeGerenciar,
    carregando: categoryState.isLoading || transactionState.isLoading,
  };
}
