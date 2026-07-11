# Open Finance Architecture

## Status

Esta etapa cria somente a arquitetura e o dominio local de Open Finance.

- Nenhuma migration foi aplicada.
- Nenhum projeto Supabase remoto foi acessado.
- Nenhuma instituicao financeira foi conectada.
- Nenhum token, certificado, segredo ou credencial bancaria foi criado.
- Producao permanece sem alteracoes.
- Paginas, CSS e mocks atuais permanecem inalterados.

A migration proposta e:

`supabase/migrations/20260711_004_open_finance_infrastructure.sql`

Ela depende das migrations de identidade, workspaces e nucleo financeiro. Sua
primeira aplicacao futura deve ocorrer exclusivamente no `UniFlow DEV`, depois
de revisao e testes controlados de RLS.

## Principio do produto

> AUTOMATICO POR PADRAO, MANUAL APENAS COMO EXCECAO.

A experiencia principal futura deve sincronizar contas e transacoes mediante
consentimento do usuario. Lancamentos manuais permanecem como fallback,
correcao ou excecao. A Uni devera categorizar, conciliar, detectar recorrencias
e transformar dados em clareza com minima intervencao humana.

## Fronteiras do dominio

O dominio externo nao substitui o nucleo financeiro.

1. O provedor envia dados para uma Edge Function ou backend seguro.
2. O backend valida assinatura, consentimento, workspace e idempotencia.
3. Dados sanitizados entram em `external_accounts` e
   `external_transactions`.
4. A conciliacao cria ou vincula registros normalizados em `accounts` e
   `transactions`.
5. A Uni usa o dominio normalizado para categorizar, reconhecer recorrencias e
   gerar sinais do GPS Financeiro.

Essa separacao preserva o payload recebido sem transformar formatos de
provedores em contrato da interface.

## Modelo de dados

### `open_finance_consents`

Registra a autorizacao LGPD/Open Finance concedida por usuario e workspace.

Responsabilidades:

- identificar provedor e instituicao;
- registrar finalidade, base legal, escopos e versoes dos termos;
- acompanhar solicitacao, autorizacao, expiracao e revogacao;
- registrar prazo de retencao e erros sanitizados;
- permitir multiplos consentimentos e provedores por workspace.

Estados:

- `created`;
- `awaiting_authorization`;
- `authorized`;
- `active`;
- `expired`;
- `revoked`;
- `failed`.

`purpose_version` e `scopes_version` preservam a versao da finalidade e dos
escopos apresentados ao usuario. `granted_at`, `expires_at` e `revoked_at`
possuem constraints de ordem temporal e coerencia com o estado.

O consentimento nao guarda access token, refresh token, authorization code,
certificado ou credencial.

### `external_accounts`

Representa contas recebidas de provedores antes ou durante a conciliacao com
`accounts`.

Responsabilidades:

- suportar varias contas bancarias por usuario e workspace;
- preservar identidade externa por provedor;
- vincular opcionalmente uma conta normalizada;
- manter saldo capturado e estado de sincronizacao;
- expor somente identificacao mascarada para interface.

Estados de conta:

- `active`;
- `inactive`;
- `disconnected`;
- `error`.

Estados de sincronizacao:

- `pending`;
- `syncing`;
- `synced`;
- `partial`;
- `error`;
- `disconnected`.

### `external_transactions`

Armazena transacoes externas sanitizadas antes da conciliacao com
`transactions`.

Responsabilidades:

- separar creditos e debitos com valores monetarios positivos;
- preservar identidade externa e fingerprint de deduplicacao;
- vincular opcionalmente a transacao normalizada;
- apoiar importacao incremental, reprocessamento e auditoria;
- guardar apenas payload minimizado e sanitizado.

Indices unicos impedem que o mesmo identificador ou fingerprint seja importado
duas vezes para a mesma conta externa, workspace e provedor.

### `sync_jobs`

Registra execucoes assincronas de sincronizacao.

Tipos:

- `accounts`;
- `transactions`;
- `full`;
- `consent_refresh`;
- `webhook_replay`.

Estados:

- `pending`;
- `running`;
- `completed`;
- `partial`;
- `failed`;
- `canceled`.

Cada job possui chave de idempotencia, contadores, tentativas, cursor e erro
sanitizado. `next_retry_at` agenda uma nova tentativa depois de falha ou
resultado parcial. `started_at` e `completed_at` possuem constraints de ordem
temporal. O identificador do evento externo deduplica webhooks.

## Idempotencia

A importacao automatica deve ser segura para retries.

- Consentimento: identidade unica por workspace, provedor, instituicao e ID
  externo.
- Conta: identidade unica por workspace, provedor, instituicao e ID externo.
- Transacao: identidade unica por workspace, provedor, conta externa e ID
  externo.
- Fingerprint: segunda barreira por conta para provedores com IDs instaveis.
- Job: chave unica por workspace, provedor e operacao logica.
- Job ativo: apenas um `pending` ou `running` por consentimento, conta e tipo.
- Webhook: evento unico por provedor e ID recebido.

O backend futuro devera usar `upsert` ou operacoes transacionais baseadas nessas
chaves. Receber novamente o mesmo evento nao pode duplicar saldo, conta ou
transacao.

## RLS e seguranca

As quatro tabelas usam `workspace_id` como fronteira de isolamento.

- O titular do consentimento e owners/admins podem ler o consentimento.
- Membros ativos podem ler contas, transacoes e jobs do workspace conforme RLS.
- O frontend autenticado nao recebe grants de insert, update ou delete.
- Grants de leitura sao por coluna; IDs operacionais, chaves de idempotencia,
  cursores e payloads sanitizados permanecem backend-only.
- Consentimentos, callbacks, webhooks e sincronizacoes sao backend-only.
- `service_role` nunca entra no frontend ou em variavel `VITE_*`.
- Tokens e certificados devem usar secret store do backend, fora das tabelas
  publicas e fora de logs.
- Payloads devem ser minimizados e sanitizados antes da persistencia.
- Dados pessoais e empresariais nao podem atravessar workspaces.

As policies iniciais sao deliberadamente somente leitura. Policies de escrita
nao devem ser abertas para facilitar testes; Edge Functions devem executar as
operacoes privilegiadas com validacao explicita de usuario, workspace,
consentimento e provedor.

## LGPD e consentimento

O usuario devera conseguir:

- entender finalidade e escopos antes de autorizar;
- conceder consentimento por instituicao;
- acompanhar vigencia e ultima sincronizacao;
- revogar consentimento;
- reconectar quando expirado;
- solicitar tratamento compativel com a politica de retencao.

A revogacao futura deve interromper novos jobs, revogar no provedor e aplicar a
politica de retencao. Excluir historico financeiro normalizado nao deve ser uma
consequencia implicita sem regra de produto e base legal claramente definidas.

## Webhooks e Edge Functions

Edge Functions ou backend seguro serao responsaveis por:

- iniciar autorizacao e callback OAuth/FAPI;
- trocar e renovar tokens;
- validar assinatura e origem de webhook;
- resolver usuario, consentimento e workspace;
- criar `sync_jobs` idempotentes;
- buscar dados paginados;
- sanitizar e persistir contas/transacoes externas;
- conciliar dados com o nucleo financeiro;
- aplicar retries, rate limits, observabilidade e alertas.

Endpoints conceituais futuros:

- `open-finance-consent-start`;
- `open-finance-consent-callback`;
- `open-finance-consent-revoke`;
- `open-finance-webhook`;
- `open-finance-sync`;
- `open-finance-sync-worker`.

Esses nomes sao referencia de arquitetura, nao APIs implementadas nesta etapa.

## Services e hook

### `openFinanceService.js`

- lista e consulta consentimentos permitidos por RLS;
- prepara contratos para iniciar e revogar consentimento;
- mutacoes retornam `OPEN_FINANCE_BACKEND_REQUIRED` enquanto nao houver Edge
  Function segura.

### `externalAccountService.js`

- lista e consulta contas externas por workspace;
- lista transacoes externas com filtros simples;
- nao expoe `sanitized_provider_data` ao frontend.

### `syncService.js`

- lista e consulta jobs por workspace;
- prepara o contrato para solicitar sincronizacao;
- nao escreve diretamente em `sync_jobs`.

### `useOpenFinance.js`

- orquestra consentimentos, contas, transacoes e jobs;
- recebe `workspaceId` explicitamente;
- nunca escolhe ou inventa workspace;
- permanece inativo e seguro sem Supabase configurado;
- expoe acoes preparadas sem conectar qualquer provedor.

## Multiplos provedores

`provider` e uma chave normalizada interna, nao o nome mostrado ao usuario.
Cada adapter futuro devera traduzir o contrato especifico do agregador ou da
instituicao para o dominio comum. Regras de UI e conciliacao nao devem depender
do formato de um provedor.

Trocar de provedor nao deve exigir migrar `accounts` e `transactions`
normalizadas. Identidades externas permanecem nas tabelas de integracao.

## Papel do n8n

n8n pode apoiar notificacoes, operacoes assincronas nao sensiveis e fluxos de
observabilidade. Ele nao sera a camada principal de consentimento, custodia de
tokens, validacao de webhooks bancarios ou acesso privilegiado ao banco.

## Proximas etapas seguras

1. Revisar a migration e suas policies.
2. Aplicar somente no `UniFlow DEV`.
3. Criar roteiro autenticado de leitura/RLS.
4. Definir provedor e requisitos regulatorios sem incluir credenciais.
5. Criar Edge Functions com secrets apenas no DEV.
6. Implementar consentimento sandbox do provedor escolhido.
7. Validar idempotencia, retries, revogacao e expiracao.
8. Conciliar contas externas com `accounts`.
9. Conciliar transacoes externas com `transactions`.
10. Conectar interface somente depois dos testes de seguranca.

## Criterios antes de producao

- revisao juridica/LGPD e termos finalizada;
- provedor homologado e contrato definido;
- secrets isolados e rotacionaveis;
- RLS e grants validados com usuarios autenticados;
- webhooks autenticados, idempotentes e resistentes a replay;
- logs sem dados sensiveis;
- revogacao e expiracao testadas;
- rate limit, retry e observabilidade ativos;
- plano de incidente e rollback documentado;
- nenhuma migration promovida sem passar antes pelo DEV.
