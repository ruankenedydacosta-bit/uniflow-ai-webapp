# Ensure Authenticated Profile

## Objetivo

A migration `20260712_006_ensure_authenticated_profile.sql` recupera contas
Auth antigas ou afetadas por concorrência que não receberam a linha automática
em `profiles`.

Ela não substitui o trigger `on_auth_user_created`. O onboarding chama a RPC
somente quando `getProfile()` não encontra o profile autenticado.

## Modelo de segurança

`public.ensure_own_profile()`:

- não recebe parâmetros;
- deriva exclusivamente `auth.uid()`;
- lê somente o registro correspondente em `auth.users`;
- cria somente o profile do usuário autenticado;
- usa `ON CONFLICT (id) DO NOTHING`, sendo idempotente e compatível com o trigger;
- retorna apenas `id`, `full_name`, `phone`, `user_mode`,
  `current_workspace_id` e `onboarding_completed`;
- não retorna email, senha, token, sessão ou dados de terceiros;
- usa `SECURITY DEFINER` porque authenticated não possui INSERT em `profiles`
  nem leitura de `auth.users`;
- usa `search_path` vazio e referências qualificadas;
- remove EXECUTE de `PUBLIC`, `anon` e `authenticated`, concedendo novamente
  somente a `authenticated`.

O frontend continua sem grant direto de INSERT em `profiles`.

## Service

`profileService.ensureOwnProfile()` chama exatamente `ensure_own_profile`, não
envia `user_id` e mantém fallback controlado quando Supabase não está
configurado. Erros do banco são convertidos para `PROFILE_ENSURE_FAILED` e uma
mensagem humana, sem detalhes internos.

## Aplicação no UniFlow DEV

1. Executar `ensure_authenticated_profile_failed_apply_audit.sql`.
2. Exigir `ensure_profile_ready_for_migration` antes da primeira aplicação.
3. Aplicar `20260712_006_ensure_authenticated_profile.sql` somente no DEV.
4. Executar `ensure_authenticated_profile_validation.sql`.
5. Exigir 10/10 checks com `passed = true`.
6. Testar um usuário com profile existente e, em fixture controlada, um usuário
   autenticado sem profile.

Produção permanece intacta. A migration não foi aplicada por este workflow.
