# Supabase Existing Project Audit

Este documento prepara a verificacao de compatibilidade entre a migration inicial da Fase 2 e o projeto Supabase ja usado pelo site da UniFlow AI.

Ele nao autoriza aplicar migrations, conectar o app ao projeto remoto ou compartilhar credenciais. O levantamento deve ser feito manualmente, com consultas somente leitura e registros sem dados sensiveis.

Migration em analise:

`supabase/migrations/20260710_001_auth_profiles_workspaces.sql`

## 1. Decisao de ambientes

- Usar a mesma conta Supabase para administrar os projetos da UniFlow AI.
- Criar um projeto separado chamado `UniFlow DEV` para desenvolvimento e testes.
- Nunca testar migrations diretamente no projeto de producao.
- No lancamento, site e aplicativo compartilharao o mesmo projeto de producao para Auth, leads e perfis.
- Aplicar primeiro no projeto DEV, validar schema, triggers, grants e RLS e somente depois preparar uma aplicacao controlada em producao.
- Nao copiar dados pessoais reais para DEV sem anonimizacao e justificativa.

## 2. Identificacao do projeto atual do site

- [ ] Nome do projeto registrado.
- [ ] Finalidade atual descrita.
- [ ] Ambiente classificado como desenvolvimento, homologacao ou producao.
- [ ] Project Reference registrado em local seguro, sem chave ou segredo.
- [ ] Regiao e versao principal do Postgres registradas.
- [ ] Responsavel tecnico pelo projeto identificado.
- [ ] Site/Landing que utiliza o projeto identificado.
- [ ] Confirmado se o projeto contem dados reais de visitantes ou clientes.
- [ ] Confirmado se existe rotina de backup e restauracao.

Resumo do ambiente:

| Campo | Resultado |
| --- | --- |
| Nome do projeto | Pendente |
| Finalidade | Pendente |
| Ambiente | Pendente |
| Site conectado | Pendente |
| Possui dados reais | Pendente |
| Responsavel | Pendente |

## 3. Checklist de inventario

### Banco e schema

- [ ] Listar todas as tabelas do schema `public`.
- [ ] Listar colunas, tipos, nulabilidade e valores default.
- [ ] Listar primary keys, foreign keys, unique constraints e checks.
- [ ] Listar indices, incluindo indices unicos e expressoes como `lower(email)`.
- [ ] Listar funcoes do schema `public`.
- [ ] Identificar funcoes `SECURITY DEFINER` e revisar `search_path`.
- [ ] Listar triggers e as funcoes chamadas por eles.
- [ ] Verificar especificamente triggers existentes em `auth.users`.
- [ ] Listar policies RLS, roles, comandos, `USING` e `WITH CHECK`.
- [ ] Confirmar o status de RLS de cada tabela publica.
- [ ] Registrar grants especiais concedidos a `anon` e `authenticated`.

### Supabase Auth

- [ ] Confirmar se Supabase Auth ja e usado pelo site.
- [ ] Registrar quantidade aproximada de usuarios sem exportar dados pessoais.
- [ ] Identificar provedores habilitados: email, Google, Apple ou outros.
- [ ] Verificar confirmacao de email e regras de senha.
- [ ] Listar URLs autorizadas de redirect e Site URL.
- [ ] Verificar templates de email customizados.
- [ ] Identificar metadata atualmente salva em `raw_user_meta_data`.
- [ ] Confirmar se ja existe trigger de criacao de perfil em `auth.users`.
- [ ] Confirmar se exclusao de usuario possui dependencias em tabelas publicas.

Provedores e URLs devem ser revisados no Dashboard do Supabase. Nao registrar secrets, tokens OAuth ou chaves neste documento.

### Lista VIP e formularios do site

- [ ] Identificar a tabela usada pela Lista VIP.
- [ ] Mapear campos enviados pelo formulario: email, nome, telefone, origem e outros.
- [ ] Identificar validacoes e normalizacao de email.
- [ ] Verificar se existe indice unico case-insensitive para email.
- [ ] Registrar como duplicidades sao tratadas.
- [ ] Identificar scripts, formularios, automacoes e integracoes que escrevem no banco.
- [ ] Verificar se o site escreve diretamente com `anon` ou passa por Edge Function/backend.
- [ ] Revisar policies de insercao publica e risco de spam.
- [ ] Confirmar se status VIP, convite ou conversao pode ser alterado pelo cliente.
- [ ] Mapear qualquer integracao externa que dependa do nome ou formato da tabela atual.

### Edge Functions e Storage

- [ ] Listar Edge Functions existentes e sua finalidade.
- [ ] Identificar quais tabelas cada Edge Function le ou altera.
- [ ] Confirmar quais funcoes usam secrets ou `service_role` somente no servidor.
- [ ] Listar buckets do Storage.
- [ ] Registrar se cada bucket e publico ou privado.
- [ ] Revisar policies de `storage.objects` relacionadas ao site.
- [ ] Identificar URLs ou nomes de bucket hardcoded no site.

## 4. Matriz de possiveis colisoes

Para cada objeto, comparar nome, finalidade, colunas, constraints, indices, triggers, grants e policies. A existencia do mesmo nome nunca deve ser tratada automaticamente como compatibilidade.

| Objeto proposto | Existe no site? | Finalidade atual | Diferencas encontradas | Classificacao | Acao recomendada |
| --- | --- | --- | --- | --- | --- |
| `profiles` | Pendente | Pendente | Pendente | Pendente | Pendente |
| `workspaces` | Pendente | Pendente | Pendente | Pendente | Pendente |
| `workspace_members` | Pendente | Pendente | Pendente | Pendente | Pendente |
| `plans` | Pendente | Pendente | Pendente | Pendente | Pendente |
| `subscriptions` | Pendente | Pendente | Pendente | Pendente | Pendente |
| `site_leads` | Pendente | Pendente | Pendente | Pendente | Pendente |

Tambem comparar estes objetos auxiliares da migration:

- [ ] Funcao `public.set_updated_at()`.
- [ ] Funcao `public.is_workspace_member(uuid, text[])`.
- [ ] Funcao `public.handle_new_workspace()`.
- [ ] Funcao `public.handle_new_user()`.
- [ ] Trigger `on_auth_user_created` em `auth.users`.
- [ ] Trigger `on_workspace_created`.
- [ ] Nomes das policies e dos indices criados pela migration.

## 5. Consultas de diagnostico

Executar manualmente no SQL Editor do projeto atual do site. Todas as consultas abaixo sao somente leitura.

### Tabelas do schema public

```sql
select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

### Colunas

```sql
select
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

### Constraints

```sql
select
  namespace.nspname as schema_name,
  relation.relname as table_name,
  constraint_record.conname as constraint_name,
  constraint_record.contype as constraint_type,
  pg_get_constraintdef(constraint_record.oid, true) as definition
from pg_constraint as constraint_record
join pg_class as relation
  on relation.oid = constraint_record.conrelid
join pg_namespace as namespace
  on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
order by relation.relname, constraint_record.conname;
```

### Indices

```sql
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```

### Funcoes

```sql
select
  namespace.nspname as function_schema,
  procedure_record.proname as function_name,
  pg_get_function_identity_arguments(procedure_record.oid) as arguments,
  pg_get_function_result(procedure_record.oid) as return_type,
  language.lanname as language,
  procedure_record.prosecdef as security_definer,
  procedure_record.proconfig as runtime_settings
from pg_proc as procedure_record
join pg_namespace as namespace
  on namespace.oid = procedure_record.pronamespace
join pg_language as language
  on language.oid = procedure_record.prolang
where namespace.nspname = 'public'
order by procedure_record.proname, arguments;
```

### Triggers

```sql
select
  trigger_record.event_object_schema,
  trigger_record.event_object_table,
  trigger_record.trigger_name,
  trigger_record.event_manipulation,
  trigger_record.action_timing,
  trigger_record.action_orientation,
  trigger_record.action_statement
from information_schema.triggers as trigger_record
where trigger_record.event_object_schema in ('public', 'auth')
order by
  trigger_record.event_object_schema,
  trigger_record.event_object_table,
  trigger_record.trigger_name,
  trigger_record.event_manipulation;
```

### Policies RLS

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
```

### Status de RLS

```sql
select
  namespace.nspname as schema_name,
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_class as relation
join pg_namespace as namespace
  on namespace.oid = relation.relnamespace
where namespace.nspname in ('public', 'storage')
  and relation.relkind in ('r', 'p')
order by namespace.nspname, relation.relname;
```

### Buckets do Storage

```sql
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
from storage.buckets
order by name;
```

## 6. Classificacao do resultado

### Compativel

- O objeto nao existe; ou
- existe com a mesma finalidade, estrutura e regras de acesso;
- nao ha conflito de nome, trigger, policy ou integracao;
- a migration pode ser testada sem perda ou reinterpretacao de dados.

### Conflito simples

- Diferenca pequena e localizada, como nome de coluna, indice ou policy;
- nao muda a finalidade do objeto;
- pode ser resolvida com ajuste pequeno e testavel em DEV.

### Conflito estrutural

- O mesmo nome representa outra entidade;
- Auth, ownership, relacionamentos ou RLS seguem modelo incompativel;
- uma alteracao direta pode bloquear login, formulario, Lista VIP ou dados existentes;
- exige redesenho antes de qualquer aplicacao.

### Exige migration de adaptacao

- O objeto existente deve ser preservado, transformado, renomeado ou preenchido;
- existem dados reais que precisam de backfill;
- integracoes dependem do contrato atual;
- a migration inicial nao pode ser aplicada como esta.

Quando houver conflito, nao editar silenciosamente uma migration ja aplicada. Preparar uma migration de adaptacao separada, revisada e testada primeiro no projeto DEV.

## 7. Criterios para liberar teste em DEV

- [ ] Inventario do projeto do site concluido.
- [ ] Matriz de colisoes preenchida.
- [ ] Trigger de `auth.users` revisado.
- [ ] Lista VIP e formularios mapeados.
- [ ] Policies e grants publicos revisados.
- [ ] Edge Functions e buckets inventariados.
- [ ] Conflitos classificados.
- [ ] Plano de adaptacao documentado, se necessario.
- [ ] Projeto `UniFlow DEV` criado sem dados reais de producao.
- [ ] Plano de rollback definido antes do primeiro teste.

## 8. Seguranca e producao

- Fazer backup verificavel antes de qualquer mudanca futura em producao.
- Nunca expor `service_role` no frontend.
- Nunca colocar chaves, tokens, secrets ou credenciais no chat, Git ou Obsidian.
- Usar o projeto `UniFlow DEV` para aplicar e testar migrations primeiro.
- Testar Auth, leads, perfil, membership e RLS com roles diferentes.
- Somente depois preparar uma aplicacao controlada no projeto de producao.
- Nao executar testes destrutivos com dados reais do site.
- Nao registrar resultados contendo emails, telefones, UUIDs de usuarios ou outros dados pessoais.

## 9. Resultado da auditoria

Status atual: `pendente de levantamento manual no projeto do site`.

Nenhuma conclusao de compatibilidade deve ser emitida antes de preencher o inventario e a matriz de colisoes.
