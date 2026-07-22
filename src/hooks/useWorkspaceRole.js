import { useEffect, useRef, useState } from 'react';
import { getMyWorkspaceMembership } from '../services/workspaceMembershipService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import { deriveWorkspaceRole, RESTRICTIVE_ROLE_STATE } from './workspaceRoleUtils.js';

const OWNER_STATE = Object.freeze(
  deriveWorkspaceRole({ ownerUserId: 'demo', userId: 'demo', membership: null }),
);

/**
 * Determina o papel do usuario autenticado no workspace atual
 * (owner/admin/member/viewer) e as permissoes derivadas (canUpdate/
 * canDelete), sem duplicar as regras de RLS -- so consulta o minimo
 * necessario (workspaceMembershipService.getMyWorkspaceMembership) e
 * aplica a mesma logica pura de workspaceRoleUtils.js usada nos testes.
 *
 * `ownerUserId` deve vir de `workspace?.owner_user_id` (ja carregado por
 * useSession(), sem custo extra) e `userId` de `useSession().user?.id`.
 * Quando os dois coincidem, o papel e resolvido como "owner" sem nenhuma
 * consulta de rede (atalho ja documentado em workspaceRoleUtils.js).
 *
 * Modo demo (Supabase nao configurado): trata o usuario como owner
 * (permissao plena), mesmo comportamento ja assumido pelo resto do app em
 * modo demo (useAccounts/useCategories/useClients nunca bloqueiam mutacoes
 * em modo demo).
 */
export function useWorkspaceRole({ workspaceId, ownerUserId, userId } = {}) {
  const [state, setState] = useState(() => ({
    ...RESTRICTIVE_ROLE_STATE,
    isLoading: Boolean(workspaceId && userId) && isSupabaseConfigured,
    error: null,
  }));
  const requestIdRef = useRef(0);

  // Mesmo padrao de useAccounts.js/useClients.js: o trabalho real roda num
  // setTimeout(0) disparado pelo efeito, nunca com setState sincrono direto
  // no corpo do efeito (react-hooks/set-state-in-effect).
  useEffect(() => {
    const requestId = ++requestIdRef.current;

    const timeoutId = window.setTimeout(async () => {
      if (!isSupabaseConfigured) {
        setState({ ...OWNER_STATE, isLoading: false, error: null });
        return;
      }

      if (!workspaceId || !userId) {
        setState({ ...RESTRICTIVE_ROLE_STATE, isLoading: false, error: null });
        return;
      }

      if (ownerUserId && userId === ownerUserId) {
        setState({
          ...deriveWorkspaceRole({ ownerUserId, userId, membership: null }),
          isLoading: false,
          error: null,
        });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      const result = await getMyWorkspaceMembership(workspaceId, userId);

      if (requestId !== requestIdRef.current) return;

      // Falha segura: resultado ausente/mal-formado ou com erro nunca
      // concede permissao -- sempre recai no derive com membership=null.
      if (!result || result.error) {
        setState({
          ...deriveWorkspaceRole({ ownerUserId, userId, membership: null }),
          isLoading: false,
          error: result?.error ?? {
            code: 'WORKSPACE_ROLE_UNKNOWN',
            message: 'Não foi possível confirmar seu papel neste espaço.',
          },
        });
        return;
      }

      setState({
        ...deriveWorkspaceRole({ ownerUserId, userId, membership: result.data ?? null }),
        isLoading: false,
        error: null,
      });
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [workspaceId, ownerUserId, userId]);

  return state;
}
