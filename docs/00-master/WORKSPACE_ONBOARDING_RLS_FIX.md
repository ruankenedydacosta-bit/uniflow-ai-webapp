# Workspace Onboarding RLS Fix

## Sintoma confirmado

O segundo usuário autenticava e chegava a `/onboarding`, mas a escolha de
“Minha vida financeira” terminava com erro `403`:

```text
new row violates row-level security policy for table "workspaces"
```

O profile permaneceu com `current_workspace_id = null` e
`onboarding_completed = false`.

## Causa

A policy `workspaces_insert_owner` já verificava corretamente que
`owner_user_id = auth.uid()`. O frontend usa
`insert(...).select(...).single()` porque precisa do workspace criado para
concluir o profile.

A policy antiga de SELECT, `workspaces_select_active_member`, permitia ler a
linha somente por `is_workspace_member(id)`. Durante o retorno do insert, essa
regra ainda não tornava o workspace recém-criado visível, embora o trigger
`on_workspace_created` crie a membership owner.

A migration 005 não toca esse fluxo e não causou a falha.

## Correção versionada

A migration `20260712_007_workspace_owner_select_policy.sql`:

1. remove explicitamente `workspaces_select_active_member`;
2. cria `workspaces_select_owner_or_active_member`;
3. mantém RLS ativo e acesso restrito a authenticated;
4. permite leitura quando o usuário é proprietário ou membro ativo.

Expressão final:

```sql
owner_user_id = (select auth.uid())
or public.is_workspace_member(id)
```

O proprietário pode ler o próprio workspace durante o `RETURNING`, membros
continuam lendo por membership e terceiros sem membership permanecem isolados.
Anon continua sem grants.

## Ownership no frontend

`workspaceService.js` não aceita mais `ownerUserId` fornecido pelo caller.
Criação e rollback obtêm o usuário diretamente de `supabase.auth.getUser()`.
A policy de INSERT continua como segunda barreira e não foi alterada.

O retorno `.select(...).single()` foi preservado porque seu ID é necessário
para preencher `profiles.current_workspace_id`.

## Estado do usuário B

O profile segue incompleto e pode repetir o onboarding depois da migration 007
ser aplicada e validada no UniFlow DEV.

Se uma tentativa criar o workspace e falhar apenas na atualização final, o
rollback remove somente o workspace daquela tentativa, usando o owner derivado
da sessão. Os logs DEV registram somente operação e código seguro.

## Aplicação segura no DEV

1. Executar `workspace_onboarding_rls_failed_apply_audit.sql`.
2. Exigir `old_policy_ready_for_migration` antes da primeira aplicação.
3. Aplicar `20260712_007_workspace_owner_select_policy.sql` no UniFlow DEV.
4. Executar `workspace_onboarding_rls_validation.sql` e exigir 9/9 checks.
5. Repetir o onboarding do usuário B.
6. Confirmar workspace, membership owner, profile concluído e Dashboard.

Não editar a policy manualmente no painel. Produção permanece intacta.
