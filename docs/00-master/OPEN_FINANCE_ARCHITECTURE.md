# Open Finance Architecture

## Status

Em 2026-10-12 nenhuma instituicao financeira esta conectada e nenhum provedor
foi escolhido.

- As tabelas da migration 004 existem em producao (`egbqrhcfxtjqwgteaknp`),
  aplicadas pela integracao Supabase-GitHub no merge, e estao vazias.
- O projeto `UniFlow DEV` citado nas revisoes de julho saiu do fluxo. Toda
  migration vai para producao no merge em `main`.
- A migration 068 ajustou o nucleo financeiro ao app atual (ver "Conta e
  lancamento do Open Finance no nucleo").
- Nenhum token, certificado, segredo ou credencial bancaria foi criado.
- A tela `/open-finance` continua sendo demonstracao visual.
- Os services e o hook `useOpenFinance` existem, mas nenhuma tela os usa.

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

## Conta e lancamento do Open Finance no nucleo

Conta e lancamento normalizados que vem do banco usam `source_type =
'open_finance'` em `accounts` e `transactions`. So o backend grava esse valor:
as policies de insert do app exigem `source_type = 'manual'`.

Regras garantidas no banco pela migration 068:

- **Saldo.** `get_derived_account_balances()` devolve, para conta do Open
  Finance com `last_synced_at` preenchido, o `accounts.current_balance`
  gravado pelo backend. O extrato importado cobre so os ultimos meses, entao
  somar lancamentos nao reproduz o saldo do banco. Antes do primeiro saldo, a
  conta segue derivada, para nao mostrar R$ 0 como se viesse do banco.
- **Contrato do saldo.** O backend grava `current_balance` na convencao do
  app, nao na do provedor: cartao fica negativo quando ha fatura a pagar (o
  limite usado e `-saldo`). Grava `last_synced_at` junto.
- **Conta protegida.** O app nao edita nome, tipo, instituicao, saldo,
  limite, fechamento, vencimento nem `is_active`, e nao exclui. `metadata`
  segue editavel. Ajuste de saldo numa conta do Open Finance e recusado por
  qualquer caminho.
- **Lancamento protegido.** O app nao edita valor, data, conta, tipo,
  descricao, status, parcelas, recorrencia nem `metadata.auto_confirm`, e nao
  exclui. Categoria, observacao, competencia e o resto de `metadata` seguem
  editaveis: recategorizar e o trabalho da pessoa e da Uni.
- **Quem e barrado.** A regra le o papel do JWT (`auth.role()`), que continua
  `authenticated` dentro de RPC `security definer`. Por isso a Uni tambem e
  barrada (ex.: reativar conta arquivada). Passam Edge Function com
  `service_role`, job sem JWT e a cascata de FK ao excluir o espaco.
- **Payload.** `transactions.raw_provider_data` saiu: era legivel por qualquer
  membro e nenhum codigo usava. O payload sanitizado mora em
  `external_transactions.sanitized_provider_data`, sem grant para o app.

Roteiro de validacao: `supabase/tests/open_finance_saldo_do_banco_e_protecao_validation.sql`.

### O que a interface ainda nao segue

O banco recusa, mas a tela ainda oferece. Precisa ser fechado antes da primeira
conexao, senao a pessoa ve o codigo cru do erro:

- Contas (`ContaDetalhePage`) e a Uni ja bloqueiam editar, ajustar saldo e
  excluir conta do Open Finance, e a Uni recusa editar ou excluir lancamento
  importado.
- Financeiro (`FinanceiroPage`, `FinanceTransactionModal`,
  `FinanceAccountModal`) e Registros (`SimplifiedRecordsPage`) oferecem editar
  e excluir lancamento e conta sem olhar `source_type`. A Uni manda a pessoa
  para o Financeiro excluir lancamento importado, onde a acao falha.
- O formulario de edicao reenvia a descricao normalizada (`trim`, texto
  padrao quando vazia). Recategorizar um lancamento do banco precisa mandar so
  os campos editaveis, senao a descricao "muda" e o banco recusa.
- Os codigos `conta_do_open_finance_protegida` e
  `lancamento_do_open_finance_protegido` nao tem mensagem na interface.

## Decisoes pendentes antes do backend

Nao dependem do provedor escolhido e precisam de resposta do dono antes da
primeira Edge Function:

1. **Conta manual que ja existe.** A pessoa registra a conta Nubank a mao ha
   meses e conecta o Nubank. A conta manual vira a do Open Finance (mantendo
   o historico) ou nasce uma conta nova e a manual e arquivada?
2. **Lancamento manual duplicado.** O mesmo gasto lancado pela voz e importado
   pelo banco. A conciliacao vincula o importado ao manual
   (`external_transactions.normalized_transaction_id`) por valor, data e conta?
   E o lancamento manual sem conta (`account_id` nulo, o caso comum hoje)?
   Hoje o app ainda aceita lancamento manual numa conta do Open Finance: ele
   nao mexe no saldo dela (que e o do banco), mas mexe na outra ponta. Uma
   transferencia manual de R$ 500 da poupanca manual para a conta do banco
   derruba o saldo do espaco em R$ 500 ate o banco mandar o credito. Decidir se
   o app passa a recusar movimento manual em conta do Open Finance.
3. **Transferencia entre contas proprias.** Duas contas conectadas mostram um
   debito e um credito. Sem conciliacao, viram uma despesa e uma receita e
   inflam os totais do mes.
4. **Aporte de meta.** O aporte cria uma transferencia manual para a conta
   vinculada (#158). Com a conta vinculada no Open Finance, o banco tambem
   manda o credito. A #206 define o comportamento da meta.
5. **Plano.** Cada conexao tem custo mensal no agregador. Definir em qual plano
   o Open Finance entra e o limite de conexoes, imposto no banco por trigger.
6. **Retencao.** `data_retention_until` existe, mas nenhum job apaga nada.
   Definir prazo apos revogacao e o que acontece com os lancamentos
   normalizados.
7. **Politica de privacidade.** O agregador entra como subprocessador na mesma
   PR da feature.

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

1. Pesquisar provedores com cobertura brasileira e sandbox.
2. Comparar PF/PJ, dados suportados, webhooks, seguranca, SLA e custos.
3. Selecionar um provedor somente depois de uma matriz documentada.
4. Definir requisitos regulatorios sem incluir credenciais no repositorio.
5. Responder as decisoes pendentes acima.
6. Criar Edge Functions com secrets do sandbox do provedor.
7. Implementar consentimento sandbox do provedor escolhido.
8. Criar roteiro autenticado de leitura/RLS para o fluxo integrado.
9. Validar idempotencia, retries, revogacao e expiracao.
10. Conciliar contas e transacoes externas com o dominio normalizado.
11. Conectar interface somente depois dos testes de seguranca.

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
- toda migration validada antes do merge numa transacao com ROLLBACK contra
  o banco, com o roteiro de teste em `supabase/tests/`.
