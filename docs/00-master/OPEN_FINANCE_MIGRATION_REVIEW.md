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

Esta revisao foi local. A migration nao foi aplicada, nenhum projeto Supabase
foi acessado e nenhuma instituicao financeira foi conectada.

## Resultado

Status: **apta para validacao controlada no UniFlow DEV depois de revisao
humana final e backup**.

A migration permanece proibida em producao nesta etapa. O roteiro
`supabase/tests/open_finance_infrastructure_validation.sql` deve ser executado
somente depois da aplicacao no DEV para confirmar o catalogo realmente criado.

## Compatibilidade com migrations anteriores

### Dependencias confirmadas

- `public.workspaces` vem da migration 001.
- `public.is_workspace_member(uuid, text[])` vem da migration 001 e evita
  recursao de RLS por ser `security definer` com `search_path` fechado.
- `public.set_updated_at()` vem da migration 001 e e reutilizada pelos quatro
  triggers novos.
- `public.accounts` e a unique key `(id, workspace_id)` vem da migration 002.
- `public.transactions` e a unique key `(id, workspace_id)` vem da migration
  002.
- `auth.users` e referenciada para titular do consentimento e solicitante do
  job.

### Ordem de criacao confirmada

1. `open_finance_consents`;
2. `external_accounts`;
3. `external_transactions`;
4. `sync_jobs`;
5. indices;
6. triggers de `updated_at`;
7. ativacao de RLS;
8. policies;
9. revokes e grants por coluna;
10. comentarios de seguranca.

Nao foram encontrados nomes de tabela, trigger, policy ou indice em colisao
com as migrations 001, 002 e 003.

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

- A migration ainda nao foi compilada por um PostgreSQL/Supabase real.
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
- [ ] Fazer backup/snapshot do DEV.
- [ ] Confirmar migrations 001, 002 e 003 aplicadas na ordem correta.
- [ ] Confirmar disponibilidade de `set_updated_at` e `is_workspace_member`.
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
