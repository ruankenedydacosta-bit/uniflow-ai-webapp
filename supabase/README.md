# Supabase

Esta pasta versiona o schema Supabase da UniFlow AI a partir da Fase 2.

## Estado atual

A migration `migrations/20260710_001_auth_profiles_workspaces.sql` foi aplicada com sucesso somente no projeto Supabase `UniFlow DEV`.

O projeto de producao permanece sem alteracoes. Esta aplicacao em DEV nao conecta Login, Onboarding ou paginas do aplicativo e nao substitui os mocks atuais.

Ela prepara:

- perfis ligados a `auth.users`;
- workspaces pessoais e empresariais;
- memberships e papeis;
- catalogo de planos e assinaturas por workspace;
- captura de leads compartilhada entre site e app;
- triggers de `updated_at` e criacao de perfil;
- RLS e privilegios minimos desde o inicio.

Nenhuma tabela financeira ou de produto foi criada nesta migration.

## Proxima validacao no DEV

1. Confirmar as seis tabelas e suas colunas no schema `public`.
2. Confirmar os quatro registros iniciais em `plans`.
3. Validar os triggers de `updated_at`, profile e owner membership.
4. Testar as policies com `anon`, `authenticated`, owner, admin, member e viewer.
5. Confirmar que `subscriptions` nao aceita escrita pelo cliente.
6. Confirmar que `site_leads` aceita somente captura publica controlada e nao permite leitura publica.
7. Registrar os resultados antes de preparar qualquer migration seguinte.

A Supabase CLI nao esta instalada neste repositorio. A aplicacao no `UniFlow DEV` foi realizada fora deste workflow local; nenhuma credencial e versionada aqui.

## Ordem inicial

1. Auth cria o usuario em `auth.users`.
2. O trigger cria somente `profiles`.
3. O onboarding futuro cria um workspace explicitamente.
4. O trigger do workspace cria a membership `owner` na mesma transacao.
5. O frontend passa a acessar somente dados autorizados pelo workspace ativo.

Nao existe criacao automatica de workspace no cadastro nesta migration.

## Seguranca

- RLS e obrigatorio desde a primeira migration.
- Site e aplicativo compartilham o mesmo projeto Supabase no MVP.
- Dados pessoais e empresariais sao isolados por workspace e membership.
- `service_role` nunca pode ser usada no frontend, em variaveis `VITE_*` ou em codigo versionado.
- Escritas administrativas em `subscriptions` e `site_leads` devem passar futuramente por backend seguro ou Edge Function.
- O site pode apenas inserir os campos publicos de captura de lead; nao pode ler leads nem definir conversao/status administrativo.
- Policies privadas nao usam `USING (true)`.

## Novas migrations

- Testar toda migration primeiro no projeto `UniFlow DEV`.
- Nunca testar uma migration nova diretamente em producao.
- Criar um novo arquivo SQL em `supabase/migrations/` para cada mudanca de schema.
- Usar prefixo temporal crescente e nome descritivo.
- Manter cada migration pequena, revisavel e transacional quando possivel.
- Incluir RLS, grants, indices e comentarios de seguranca junto da tabela criada.
- Nunca editar uma migration que ja tenha sido aplicada em producao; criar outra migration corretiva.

Formato recomendado:

```text
YYYYMMDD_NNN_descricao_da_mudanca.sql
```

## Decisoes ainda pendentes

- fluxo seguro de transferencia do owner principal;
- protecao contra remocao do ultimo owner;
- modelo real de cobranca e historico de assinaturas;
- operacoes administrativas, rate limit e protecao antiabuso para leads;
- criacao de workspace pelo onboarding real.

Essas decisoes devem entrar em migrations futuras, sem alterar esta migration depois de aplicada.
