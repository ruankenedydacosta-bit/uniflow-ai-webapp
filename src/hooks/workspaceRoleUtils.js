// Logica pura de derivacao de permissao a partir do papel do usuario no
// workspace. Espelha exatamente as policies RLS reais de
// supabase/migrations/20260721_015_crm_clients.sql:
//   - update (clients_update_active_contributor): owner, admin, member
//   - delete (clients_delete_owner_or_admin): owner, admin
// e o schema de supabase/migrations/20260710_001_auth_profiles_workspaces.sql:
//   workspace_members.role  in ('owner','admin','member','viewer')
//   workspace_members.status in ('active','invited','disabled')
// Sem dependencia de React/Supabase -- testavel via node --test.

export const UPDATE_ROLES = Object.freeze(['owner', 'admin', 'member']);
export const DELETE_ROLES = Object.freeze(['owner', 'admin']);

/**
 * Deriva { role, isOwner, isAdmin, canUpdate, canDelete } a partir de:
 *  - ownerUserId/userId: se coincidem, o usuario e o owner do workspace
 *    (`workspaces.owner_user_id`), MESMO que nao exista uma linha
 *    correspondente em workspace_members (atalho pedido explicitamente).
 *  - membership: { role, status } vindo de workspace_members, ou null
 *    quando nao ha linha (ou quando a consulta falhou -- quem chama deve
 *    passar null nesse caso, nunca inventar um valor).
 *
 * Comportamento restritivo por padrao: qualquer coisa que nao seja um
 * `role` valido com `status === 'active'` (ou o atalho de owner) resulta em
 * canUpdate=false/canDelete=false -- nunca concede permissao por fallback.
 * Um `role` fora do enum conhecido (dado inesperado) tambem e restritivo,
 * nao lanca excecao.
 */
export function deriveWorkspaceRole({ ownerUserId, userId, membership } = {}) {
  if (ownerUserId && userId && ownerUserId === userId) {
    return { role: 'owner', isOwner: true, isAdmin: false, canUpdate: true, canDelete: true };
  }

  const role = membership && membership.status === 'active' ? membership.role : null;

  return {
    role: role ?? null,
    isOwner: role === 'owner',
    isAdmin: role === 'admin',
    canUpdate: Boolean(role) && UPDATE_ROLES.includes(role),
    canDelete: Boolean(role) && DELETE_ROLES.includes(role),
  };
}

/** Estado inicial/restritivo, reaproveitado enquanto o papel ainda nao foi determinado. */
export const RESTRICTIVE_ROLE_STATE = Object.freeze(
  deriveWorkspaceRole({ ownerUserId: null, userId: null, membership: null }),
);
