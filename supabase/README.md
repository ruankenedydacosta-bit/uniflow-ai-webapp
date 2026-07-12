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

## Nucleo financeiro no DEV

A migration `migrations/20260711_002_financial_core.sql` esta aplicada no
`UniFlow DEV` e sustenta o Financeiro real usado nos testes de contas,
categorias e lancamentos.

Ela prepara:

- `accounts`, `categories` e `transactions` isoladas por workspace;
- dados manuais e origens externas normalizadas;
- identificadores e indices para deduplicacao futura;
- integridade entre transacao, contas e categorias;
- RLS para owner, admin, member e viewer;
- grants por coluna para impedir que o frontend forje origem externa.

A migration dependente `migrations/20260711_003_financial_catalog_seeds.sql`
tambem foi preparada para o catalogo global `account_types`, FK de tipo de
conta e categorias sistemicas. A ordem no DEV permanece 002 seguida de 003.

O frontend conserva fallback mockado quando Supabase nao esta configurado. No
ambiente autenticado, o CRUD respeita workspace e RLS. Producao permanece sem
alteracoes.

## Open Finance validado no DEV

Em 2026-07-11, a migration
`migrations/20260711_004_open_finance_infrastructure.sql` foi aplicada e
validada somente no projeto Supabase `UniFlow DEV`.

Resultado: 12/12 verificacoes aprovadas.

- quatro tabelas criadas;
- RLS ativo nas quatro tabelas;
- quatro policies seguras de `SELECT`;
- nenhuma escrita liberada ao frontend;
- nenhuma coluna com nome destinado a token, secret, password, certificate ou
  private key;
- doze foreign keys presentes;
- todas as FKs compostas apoiadas por unicidade compativel;
- sete indices de idempotencia presentes;
- dois indices workspace-first presentes;
- triggers de `updated_at` presentes.

A migration 004 esta aprovada no DEV. Ela ainda nao conecta bancos, nao possui
credenciais e nao implementa provedor ou Edge Function. Producao nao recebeu a
migration e permanece intacta.

O proximo passo e pesquisar e selecionar um provedor Open Finance com sandbox,
usando `docs/00-master/OPEN_FINANCE_PROVIDER_SELECTION.md` como roteiro.

## Validacoes concluidas no DEV

Os testes manuais foram realizados somente no projeto `UniFlow DEV` e confirmaram:

- criacao de usuario em `auth.users`;
- criacao automatica do registro correspondente em `profiles`;
- criacao manual de workspace pessoal;
- criacao automatica da membership do proprietario;
- membership com `role = owner` e `status = active`.

Em 2026-07-10, o roteiro autenticado de RLS tambem foi concluido com 8/8 testes aprovados:

- autenticacao do usuario de teste;
- leitura do proprio profile;
- leitura dos workspaces permitidos;
- leitura da membership owner ativa;
- leitura do catalogo de plans;
- bloqueio de leitura de `site_leads`;
- bloqueio de escrita em `subscriptions`;
- encerramento da sessao com `signOut`.

Os testes usaram cliente autenticado e chave publica. `service_role` nao foi usada.

O projeto de producao permanece sem alteracoes.

## Memoria Financeira V1 no DEV

Em 2026-07-12, a migration
`migrations/20260711_005_uni_financial_memory.sql` foi aplicada somente no
projeto `UniFlow DEV`.

A validacao estatica consolidada foi concluida com 21/21 checks aprovados,
cobrindo tabelas, colunas, RLS, policies, grants, RPCs, constraints,
sanitizacao, indices e triggers. Producao permanece sem a migration 005.

O roteiro autenticado de dois usuarios esta disponivel em
`scripts/supabase/test-memory-rls.js`, mas ainda nao foi executado. Ele deve ser
rodado manualmente apenas no DEV, com anon/publishable key e credenciais locais
dos dois usuarios de teste.

## Proximo passo

1. Integrar Supabase Auth ao Login existente sem alterar o visual.
2. Manter o Onboarding mockado nesta proxima etapa.
3. Manter os mocks dos modulos enquanto o access real entra gradualmente.
4. Preservar o fallback seguro quando Supabase nao estiver configurado.
5. Validar os papeis admin, member e viewer em uma etapa posterior com fixtures controladas.

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
- A anon/publishable key acessa o nucleo financeiro somente conforme grants e RLS.
- Tokens Open Finance, credenciais, certificados e segredos nunca ficam em `accounts`, `transactions`, `metadata` ou payload bruto.
- `raw_provider_data` deve ser sanitizado e nunca consumido diretamente pela interface.
- Integracoes Open Finance reais exigirao backend seguro ou Edge Function.
- Consentimentos terao expiracao e revogacao em uma migration futura.

## Novas migrations

- Testar toda migration primeiro no projeto `UniFlow DEV`.
- Nunca testar uma migration nova diretamente em producao.
- Criar um novo arquivo SQL em `supabase/migrations/` para cada mudanca de schema.
- Usar prefixo temporal crescente e nome descritivo.
- Manter cada migration pequena, revisavel e transacional quando possivel.
- Incluir RLS, grants, indices e comentarios de seguranca junto da tabela criada.
- Nunca editar uma migration que ja tenha sido aplicada em producao; criar outra migration corretiva.

### Recuperacao segura de profiles antigos

A migration `20260712_006_ensure_authenticated_profile.sql` corrige o caso de
contas Auth antigas que não receberam `profiles` pelo trigger. Ela cria a RPC
`ensure_own_profile`, limitada ao próprio `auth.uid()`, e mantém o frontend sem
grant direto de `INSERT` em `profiles`.

Essa migration está preparada localmente e ainda precisa ser aplicada e
validada somente no UniFlow DEV. Produção não foi acessada nem alterada.

### Policy de SELECT de workspaces no onboarding

A migration `20260712_007_workspace_owner_select_policy.sql` corrige o `403`
do `INSERT ... RETURNING` de workspaces. Ela substitui apenas a policy de
SELECT, permitindo leitura pelo `owner_user_id` autenticado ou por membership
ativa. A policy de INSERT, RLS e grants permanecem inalterados.

Antes da aplicação, executar
`tests/workspace_onboarding_rls_failed_apply_audit.sql`. Depois, exigir 9/9 em
`tests/workspace_onboarding_rls_validation.sql`. A migration ainda não foi
aplicada remotamente e produção permanece intacta.

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
