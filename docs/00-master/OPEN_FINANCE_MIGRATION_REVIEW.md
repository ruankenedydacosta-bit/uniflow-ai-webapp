# Open Finance Migration Review

## Escopo

Revisao pre-aplicacao da migration:

`supabase/migrations/20260711_004_open_finance_infrastructure.sql`

Base comparada:

- `20260710_001_auth_profiles_workspaces.sql`;
- `20260711_002_financial_core.sql`;
- `20260711_003_financial_catalog_seeds.sql`;
- `OPEN_FINANCE_ARCHITECTURE.md`;
- `FINANCIAL_CORE_DATA_MODEL.md`;
- `SUPABASE_AUTH_AND_DATA_PLAN.md`.

Esta revisao de correcao foi local. Uma tentativa informada pelo usuario no
`UniFlow DEV` falhou antes da aplicacao completa. O Codex nao acessou o projeto
remoto e nenhuma instituicao financeira foi conectada.

## Resultado

Status: **corrigida localmente; exige auditoria de objetos parciais no UniFlow
DEV antes de qualquer nova tentativa**.

A migration permanece proibida em producao nesta etapa. O roteiro
`supabase/tests/open_finance_infrastructure_validation.sql` deve ser executado
somente depois da aplicacao no DEV para confirmar o catalogo realmente criado.

## Incidente PostgreSQL 42830

A tentativa de aplicar a migration 004 no `UniFlow DEV` falhou com:

`ERROR: 42830: there is no unique constraint matching given keys for referenced table "transactions"`

A constraint exata atingida pela ordem da migration era:

`external_transactions_normalized_workspace_fkey`

Antes da correcao, ela declarava:

- colunas locais: `(normalized_transaction_id, workspace_id)`;
- colunas referenciadas: `public.transactions(id, workspace_id)`.

O arquivo local da migration 002 declara uma unique constraint nessa ordem,
mas o erro prova que o catalogo do DEV nao encontrou uma chave UNIQUE valida,
nao parcial e compativel no momento da execucao.

Correcao aplicada sem alterar migrations 001-003:

```sql
create unique index if not exists transactions_workspace_id_id_uidx
on public.transactions (workspace_id, id);
```

A FK agora usa a mesma ordem workspace-first:

```text
(workspace_id, normalized_transaction_id)
  -> public.transactions(workspace_id, id)
```

O mesmo reforco preventivo foi aplicado a `accounts`:

```text
(workspace_id, normalized_account_id)
  -> public.accounts(workspace_id, id)
```

com o indice `accounts_workspace_id_id_uidx`. Isso preserva a garantia de que
o registro normalizado pertence ao mesmo workspace.

## Auditoria da tentativa que falhou

A migration usa `begin`/`commit`, portanto uma execucao integral no mesmo
contexto deveria reverter os objetos da 004 quando ocorre erro. Ainda assim, o
SQL Editor pode executar selecoes ou blocos de maneiras diferentes, e o estado
remoto nao deve ser presumido.

Antes de reaplicar, execute somente no DEV:

`supabase/tests/open_finance_failed_apply_audit.sql`

Interpretacao do primeiro resultado:

- `no_004_tables_found`: nenhuma tabela da 004 permaneceu;
- `partial_004_schema_manual_review_required`: existem objetos parciais; nao
  reaplicar;
- `all_004_tables_found_review_before_reapply`: revisar toda a instalacao antes
  de qualquer acao.

O roteiro nao contem `DROP`. Se houver objetos parciais, a limpeza deve ser
manual, revisada e executada separadamente no DEV.

## Compatibilidade com migrations anteriores

### Dependencias confirmadas

- `public.workspaces` vem da migration 001.
- `public.is_workspace_member(uuid, text[])` vem da migration 001 e evita
  recursao de RLS por ser `security definer` com `search_path` fechado.
- `public.set_updated_at()` vem da migration 001 e e reutilizada pelos quatro
  triggers novos.
- `public.accounts` e `public.transactions` vem da migration 002.
- A migration 004 cria, com `IF NOT EXISTS`, indices UNIQUE nao parciais em
  `(workspace_id, id)` para as FKs de conciliacao.
- `auth.users` e referenciada para titular do consentimento e solicitante do
  job.

### Ordem de criacao confirmada

1. indices UNIQUE workspace-first em `accounts` e `transactions`;
2. `open_finance_consents`;
3. `external_accounts`;
4. `external_transactions`;
5. `sync_jobs`;
6. indices;
7. triggers de `updated_at`;
8. ativacao de RLS;
9. policies;
10. revokes e grants por coluna;
11. comentarios de seguranca.

Nao foram encontrados nomes de tabela, trigger, policy ou indice em colisao
com as migrations 001, 002 e 003.

As outras FKs compostas foram auditadas:

- `open_finance_consents(id, workspace_id, provider)` possui unique constraint
  na mesma ordem;
- `external_accounts(id, workspace_id, provider)` possui unique constraint na
  mesma ordem;
- FKs para consentimento e conta externa repetem exatamente essa ordem;
- `workspaces` e referenciada apenas por `id`, sua primary key;
- nao existem referencias a tabelas `open_finance_providers` ou
  `open_finance_institutions` nesta migration.

Nao foi adotado `CREATE TABLE IF NOT EXISTS`. Em schema parcial, isso poderia
mascarar tabelas incompletas e permitir que indices, policies ou grants fossem
aplicados sobre uma estrutura divergente. Apenas os dois indices de
compatibilidade nas tabelas normalizadas usam `IF NOT EXISTS`. Havendo objetos
parciais da 004, a regra e auditar e limpar manualmente antes de reaplicar.

## Problemas encontrados e correcoes

### 1. Ciclo de consentimento ambiguo

Antes da revisao, os estados misturavam `pending`, `rejected` e `error`, e o
timestamp principal era `authorized_at`.

Correcao:

- estados oficiais: `created`, `awaiting_authorization`, `authorized`,
  `active`, `expired`, `revoked`, `failed`;
- timestamp de concessao: `granted_at`;
- `purpose_version` e `scopes_version` adicionados;
- versoes de finalidade, escopos, termos e privacidade sao obrigatorias;
- constraints ligam status a concessao, expiracao, revogacao e falha;
- `expires_at > granted_at`;
- `revoked_at` existe somente quando `status = revoked`;
- retencao nao pode terminar antes do evento temporal aplicavel.

Ativacao real continua backend-only. O frontend nao recebe qualquer grant de
escrita e nao consegue fabricar um consentimento `active`.

### 2. Consentimento legivel depois da perda de membership

A policy anterior permitia ao titular ler seu consentimento apenas por
`user_id`, mesmo depois de sair do workspace.

Correcao:

- o titular precisa continuar membro ativo do workspace;
- owner/admin ativo pode acompanhar os consentimentos do workspace;
- nenhum outro membro acessa consentimento alheio.

### 3. IDs externos com escopo insuficiente

Provider e workspace nem sempre bastam: alguns IDs podem ser locais a uma
instituicao ou conta.

Correcao:

- consentimentos: workspace + provider + instituicao + ID externo;
- contas: workspace + provider + instituicao + ID externo;
- transacoes: workspace + provider + conta externa + ID externo;
- fingerprint: workspace + provider + conta externa + fingerprint;
- provider faz parte das FKs compostas entre consentimento, conta, transacao e
  job.

### 4. Jobs duplicados em paralelo

A chave de idempotencia impedia repetir a mesma chave, mas duas requisicoes
equivalentes com chaves diferentes ainda poderiam executar juntas.

Correcao:

- indice unico parcial permite apenas um job `pending` ou `running` para a
  mesma combinacao de workspace, provider, consentimento, conta e tipo;
- a chave de idempotencia continua unica por workspace e provider;
- eventos de webhook continuam unicos por provider e ID externo.

### 5. Retry e timestamps incompletos

Antes da revisao, jobs usavam `queued`/`succeeded`, `finished_at` e nao tinham
agendamento de retry.

Correcao:

- estados: `pending`, `running`, `completed`, `partial`, `failed`, `canceled`;
- `completed_at` substitui `finished_at`;
- `next_retry_at` foi adicionado;
- retry so pode ser agendado depois de `partial` ou `failed`;
- `started_at >= requested_at`;
- `completed_at >= started_at` quando houver inicio;
- estados terminais exigem `completed_at`;
- tentativa atual nao pode ultrapassar `max_attempts`;
- mensagem de erro e limitada a 1000 caracteres e deve ser sanitizada.

### 6. Exposicao ampla de colunas por SELECT

As policies eram somente leitura, mas `grant select on table` permitia ao
cliente consultar colunas operacionais que os services nao usavam.

Correcao:

- grants de `authenticated` agora sao por coluna;
- payload sanitizado, metadata, IDs externos, fingerprint, cursor, chave de
  idempotencia, ID de webhook e solicitante permanecem backend-only;
- `anon` nao recebe qualquer acesso;
- nenhum insert, update ou delete foi concedido ao frontend.

### 7. Nome de payload pouco explicito

`provider_data` poderia sugerir que payload bruto era aceitavel.

Correcao:

- coluna renomeada para `sanitized_provider_data`;
- comentarios reforcam minimizacao e proibicao de segredos;
- services nao selecionam essa coluna.

## Resumo das policies

### `open_finance_consents`

Leitura para:

- titular, desde que ainda seja membro ativo;
- owner ou admin ativo do workspace.

### `external_accounts`

Leitura para membro ativo do workspace.

### `external_transactions`

Leitura para membro ativo do workspace.

### `sync_jobs`

Leitura para membro ativo do workspace.

Todas as policies sao `SELECT` para `authenticated`. Nao existe policy privada
com `USING (true)`, escrita publica ou grant de escrita para frontend. A
`service_role` e mencionada somente como capacidade futura de backend e nunca
deve entrar em codigo cliente ou variavel `VITE_*`.

## Normalizacao e conciliacao futura

`external_accounts` e `external_transactions` sao area de ingestao sanitizada.
Elas nao substituem `accounts` e `transactions`.

Uma camada futura de conciliacao executada no backend devera:

1. validar consentimento ativo e workspace;
2. importar dados externos de forma idempotente;
3. localizar ou criar a conta normalizada;
4. preencher `normalized_account_id`;
5. detectar duplicidade entre transacao externa e lancamento existente;
6. criar ou vincular a transacao normalizada;
7. preencher `normalized_transaction_id`;
8. categorizar e detectar recorrencias sem apagar a origem;
9. registrar resultado e contadores no `sync_job`.

Nenhuma normalizacao automatica, trigger de conciliacao ou escrita externa foi
implementada nesta etapa.

## Validacao estatica criada

`supabase/tests/open_finance_infrastructure_validation.sql` verifica:

- quatro tabelas e suas colunas;
- ausencia de colunas com nomes de segredo;
- foreign keys e acoes referenciais;
- compatibilidade de ordem entre cada FK composta e sua chave UNIQUE;
- constraints de dominio, status e tempo;
- indices de idempotencia;
- RLS e policies;
- ausencia de `USING (true)`;
- grants por tabela e coluna;
- colunas operacionais ocultas do frontend;
- triggers de `updated_at`;
- resumo automatico com checks booleanos.

Executar o roteiro como `postgres` valida declaracoes do catalogo, nao o
comportamento real de RLS. O teste autenticado sera uma etapa separada.

## Riscos pendentes

- A primeira tentativa no DEV encontrou o erro 42830; a correcao ainda nao foi
  reaplicada nem compilada pelo PostgreSQL remoto.
- RLS ainda nao foi validada com titular, owner, admin, member removido e anon.
- O banco limita tamanho de erro, mas a sanitizacao semantica depende do
  backend.
- Transicoes entre estados sao validadas por consistencia final, nao por uma
  maquina de estados com trilha de cada transicao.
- Expiracao nao muda status automaticamente; exigira scheduler/backend.
- Revogacao no provedor e politica real de exclusao/retencao continuam futuras.
- Contrato do provider, FAPI, certificados, mTLS e secret storage nao foram
  definidos.
- Assinatura, replay protection e rate limit de webhooks continuam futuros.
- Conciliacao e regras de edicao de dados sincronizados continuam pendentes.
- Requisitos juridicos e regulatorios precisam de revisao especializada antes
  de producao.

## Checklist para aplicacao no UniFlow DEV

- [ ] Confirmar que o projeto selecionado e `UniFlow DEV`.
- [ ] Confirmar que nenhuma credencial de producao esta ativa no terminal.
- [ ] Executar `open_finance_failed_apply_audit.sql`.
- [ ] Confirmar `no_004_tables_found` ou concluir limpeza manual revisada.
- [ ] Fazer backup/snapshot do DEV.
- [ ] Confirmar migrations 001, 002 e 003 aplicadas na ordem correta.
- [ ] Confirmar disponibilidade de `set_updated_at` e `is_workspace_member`.
- [ ] Confirmar os indices `accounts_workspace_id_id_uidx` e
  `transactions_workspace_id_id_uidx` depois da aplicacao.
- [ ] Revisar a versao PostgreSQL do projeto DEV.
- [ ] Revisar o diff final da migration 004.
- [ ] Aplicar a migration como uma unica transacao.
- [ ] Executar `open_finance_infrastructure_validation.sql`.
- [ ] Confirmar todos os checks finais com `passed = true`.
- [ ] Testar RLS com chave publica e usuarios autenticados.
- [ ] Testar titular, owner, admin, membro comum, membro removido e anon.
- [ ] Confirmar que inserts/updates/deletes do frontend sao bloqueados.
- [ ] Confirmar que colunas backend-only nao podem ser selecionadas.
- [ ] Registrar resultado sem incluir credenciais ou payload bancario.
- [ ] Nao promover para producao.

## Checklist de rollback no DEV

- [ ] Interromper imediatamente qualquer teste ou worker futuro.
- [ ] Registrar o erro sem copiar segredo ou payload sensivel.
- [ ] Se a transacao de migration falhar, confirmar rollback automatico.
- [ ] Se ja tiver concluido, preservar backup e verificar se existem dados.
- [ ] Nao executar `DROP` ad hoc no SQL Editor.
- [ ] Preparar e revisar um roteiro de rollback separado, somente para DEV.
- [ ] Remover dependencias na ordem inversa: jobs, transacoes externas, contas
  externas e consentimentos.
- [ ] Restaurar snapshot se a remocao segura nao puder ser garantida.
- [ ] Reexecutar diagnosticos das migrations 001, 002 e 003.
- [ ] Documentar causa e correcao antes de nova tentativa.

## Confirmacao de nao integracao

Esta revisao nao:

- aplicou migration;
- acessou Supabase remoto;
- conectou banco ou provedor;
- criou token, certificado ou credencial;
- implementou Edge Function;
- usou `service_role` no frontend;
- alterou tela, CSS ou fluxo atual do aplicativo.
