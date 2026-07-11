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

## Migration financeira pendente

A migration `migrations/20260711_002_financial_core.sql` foi criada localmente e ainda nao foi aplicada em nenhum projeto Supabase.

Ela prepara:

- `accounts`, `categories` e `transactions` isoladas por workspace;
- dados manuais e origens externas normalizadas;
- identificadores e indices para deduplicacao futura;
- integridade entre transacao, contas e categorias;
- RLS para owner, admin, member e viewer;
- grants por coluna para impedir que o frontend forje origem externa.

Antes de qualquer aplicacao, a migration deve ser revisada e testada somente no `UniFlow DEV`. Producao permanece sem alteracoes.

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
