// GUARD FIX (troca de dispositivo/sessão restaurada): a assinatura do
// Plano Pessoal está sempre vinculada ao workspace do tipo "personal" --
// nunca ao workspace "atual/ativo" (workspace.id de useSession()), que
// pode divergir dele (ex.: current_workspace_id ainda não migrado para um
// workspace pessoal criado depois). Resolver único, usado tanto pelo guard
// de rota (App.jsx) quanto pelas telas do Plano Pessoal -- nunca duas
// implementações divergentes decidindo o workspaceId de formas diferentes,
// o que já causou o guard de rota consultar a assinatura do workspace
// errado e mandar um assinante ativo de volta para /plano-pessoal.
export function resolvePersonalWorkspaceId(availableWorkspaces, workspace) {
  const personalWorkspace = availableWorkspaces?.find(
    (item) => item?.workspace_type === 'personal',
  );
  return personalWorkspace?.id ?? workspace?.id ?? null;
}
