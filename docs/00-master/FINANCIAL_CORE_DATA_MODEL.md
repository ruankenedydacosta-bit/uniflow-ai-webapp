# Financial Core Data Model

Este documento descreve o primeiro dominio financeiro real da UniFlow AI. A base usa duas migrations versionadas:

- `supabase/migrations/20260711_002_financial_core.sql`;
- `supabase/migrations/20260711_003_financial_catalog_seeds.sql`.

## Status

- Migrations criadas localmente e ainda nao aplicadas.
- Nenhuma conexao com Supabase remoto foi realizada nesta etapa.
- Telas e mocks continuam inalterados.
- O primeiro ambiente permitido para aplicacao futura e o `UniFlow DEV`.
- Producao permanece fora desta etapa.

## Objetivo de produto

O nucleo financeiro deve sustentar o GPS Financeiro: onde o usuario esta, o que mudou, para onde esta indo e qual proximo passo faz sentido.

As tabelas registram fatos financeiros consistentes. A interpretacao, a projecao e a orientacao da Uni permanecem em camadas de dominio futuras. O banco nao deve empurrar a experiencia para uma planilha nem obrigar o usuario a preencher o que a Uni podera compreender.

## Fronteira de isolamento

`workspace_id` separa dados pessoais e empresariais.

- Toda conta pertence a um workspace.
- Toda transacao pertence a um workspace.
- Categorias personalizadas pertencem a um workspace.
- Categorias globais pertencem ao sistema e possuem `workspace_id = null`.
- Membership ativa e RLS determinam quem pode ler ou alterar dados.

Uma transacao nao consegue apontar para uma conta de outro workspace. Isso e garantido por foreign keys compostas, nao apenas pelo frontend.

## Accounts

`accounts` representa conta corrente, poupanca, dinheiro, cartao, investimento, carteira digital ou outra fonte de saldo.

Principais grupos de campos:

- identidade: `id`, `workspace_id`, `name`, `account_type`;
- informacao financeira: moeda, saldos e limite;
- ciclo de cartao: fechamento e vencimento;
- origem: `source_type`, provider e identificador externo;
- sincronizacao: status e ultima sincronizacao;
- auditoria basica: criador e timestamps.

Instituicao e identificadores externos sao opcionais. Uma conta manual nao precisa estar ligada a banco ou provedor.

Os valores usam `numeric(18,2)`. Valores monetarios nunca usam `float`.

### Catalogo de tipos de conta

`account_types` transforma os codigos aceitos pela constraint em um catalogo global legivel pela interface. O seed inicial contem:

- conta corrente;
- poupanca;
- dinheiro;
- cartao de credito;
- investimentos;
- carteira digital;
- outra conta.

O catalogo e somente leitura para o frontend autenticado. `accounts.account_type` possui FK para o codigo, enquanto o check da migration base permanece como protecao adicional.

## Categories

`categories` organiza entradas, despesas e transferencias.

Existem dois escopos:

- categoria global do sistema: `is_system = true`, sem workspace e sem criador;
- categoria customizada: `is_system = false`, com workspace.

Indices unicos evitam duplicidade simples de nome e tipo, ignorando diferenca entre maiusculas e minusculas. O trigger de hierarquia impede parent em outro workspace e ciclos.

A migration 003 inclui um catalogo inicial pequeno, global e sistemico:

- entradas: salario, receita de vendas, rendimentos e outras entradas;
- despesas: moradia, alimentacao, transporte, saude, educacao, lazer, assinaturas, impostos, fornecedores, operacional e outras despesas;
- transferencia: transferencia.

O seed nao define cor ou icone para evitar antecipar decisoes do Design System. Novas categorias globais entram por migration; categorias do usuario continuam pertencendo ao workspace.

## Services e hooks

Os services formam a fronteira para a migracao gradual dos mocks. Na Fase 2, a pagina Financeiro passou a consumi-los por hooks, mantendo fallback local quando Supabase nao esta configurado.

### `accountService.js`

- lista tipos de conta;
- lista e consulta contas por workspace;
- cria e atualiza somente campos permitidos ao frontend;
- arquiva ou exclui conforme RLS.

### `categoryService.js`

- lista categorias globais;
- combina catalogo global e categorias do workspace;
- cria, atualiza e exclui somente categorias customizadas.

### `transactionService.js`

- lista transacoes com filtros e limite controlado;
- consulta por workspace e ID;
- cria, atualiza e exclui lancamentos manuais;
- nunca aceita campos de provider, importacao ou payload bruto pelo frontend.

Todos retornam respostas controladas sem Supabase configurado. IDs de workspace e entidades sao validados antes de compor consultas. RLS permanece como autoridade final.

Criar uma transacao nao recalcula `current_balance` no cliente. Essa regra dependera de uma funcao transacional/RPC futura para evitar divergencia de saldo.

Hooks correspondentes:

- `useAccounts`;
- `useCategories`;
- `useTransactions`.

A integracao visual e os limites da Fase 2 estao em `docs/00-master/FINANCIAL_PHASE_2_UI_INTEGRATION.md`.

## Transactions

`transactions` registra entradas, despesas, transferencias e ajustes.

O campo `amount` e sempre positivo. O sentido vem de `transaction_type`:

- `income`: entrada na conta;
- `expense`: saida da conta;
- `transfer`: deslocamento entre duas contas;
- `adjustment`: correcao explicita de dominio.

Essa regra evita dupla interpretacao entre sinal e tipo e simplifica agregacoes, importacoes e projecoes.

## Transferencias

Uma transferencia usa uma unica transacao com:

- `account_id` como origem;
- `destination_account_id` como destino;
- `transaction_type = transfer`;
- valor positivo.

Origem e destino devem ser diferentes e pertencer ao mesmo workspace. Outros tipos nao podem informar conta de destino.

A representacao contabil definitiva, incluindo eventual modelo de duas pernas imutaveis, deve ser reavaliada antes de conciliacao bancaria completa.

## Recorrencia e parcelas

- Parcelas exigem numero e total juntos, com numero entre 1 e o total.
- `recurrence_rule` e obrigatoria somente quando `is_recurring = true`.
- Estruturas JSON devem ser objetos.

O motor que gera ocorrencias futuras ainda nao existe e nao faz parte desta migration.

## Dados manuais e externos

`source_type` permite convivencia entre:

- manual;
- importacao;
- Open Finance;
- automacao;
- IA, quando aplicavel a transacoes;
- sistema.

O cliente autenticado recebe grants para criar apenas registros manuais. Importacoes, automacoes e sincronizacoes futuras deverao passar por uma camada segura que normalize os dados antes da escrita.

Campos externos guardam somente identidade operacional normalizada:

- provider;
- identificador externo da conta;
- identificador externo da transacao;
- data de importacao/sincronizacao;
- status de sincronizacao;
- payload bruto opcional e sanitizado.

## Deduplicacao externa

Indices unicos parciais evitam duplicidade quando provider e identificador externo existem:

- conta: workspace + provider + external account id;
- transacao: workspace + provider + external transaction id.

Registros manuais, que nao possuem essa identidade externa, continuam convivendo normalmente.

A estrategia depende da estabilidade dos IDs entregues pelo futuro agregador. Providers que alterem IDs exigirao chave de idempotencia ou regra de conciliacao adicional.

## Open Finance futuro

Esta migration prepara o dominio, mas nao implementa integracao Open Finance.

Nao existem nesta etapa:

- consentimentos;
- tokens de acesso ou refresh;
- credenciais bancarias;
- certificados;
- webhooks;
- conexoes por instituicao;
- Edge Functions;
- provider especifico.

Tokens e segredos nunca devem entrar em `accounts`, `transactions`, `metadata` ou `raw_provider_data`. Conexoes reais exigirao backend seguro ou Edge Function, criptografia adequada e ciclo de consentimento com expiracao e revogacao.

Dados externos devem ser normalizados antes de alimentar o dominio financeiro. A interface nunca deve consumir `raw_provider_data` diretamente.

## RLS e privilegios

### Accounts

- membro ativo le;
- owner, admin e member inserem e atualizam;
- viewer apenas le;
- owner e admin excluem;
- inserts do frontend usam origem manual e `created_by = auth.uid()`.

### Categories

- usuario autenticado le categorias globais do sistema;
- membro ativo le categorias do workspace;
- owner, admin e member criam categorias customizadas;
- owner/admin ou o member criador alteram e excluem;
- categorias do sistema nao podem ser alteradas pelo frontend.

### Transactions

- membro ativo le;
- owner, admin e member inserem e atualizam;
- viewer apenas le;
- owner/admin ou o criador excluem;
- inserts do frontend usam origem manual e `created_by = auth.uid()`.

RLS e grants por coluna trabalham juntos. `service_role` nunca pertence ao frontend.

## Validacao

`supabase/tests/financial_core_validation.sql` verifica estaticamente:

- tabelas e tipos;
- constraints e indices;
- RLS ativo;
- policies e grants;
- triggers;
- ausencia de campos destinados a tokens ou segredos.
- catalogo de tipos de conta e categorias globais iniciais.

Consulta no SQL Editor como `postgres` nao valida RLS real. Depois da aplicacao no DEV sera necessario um teste com supabase-js, chave publica e usuarios autenticados nos papeis owner, admin, member e viewer.

## Decisoes pendentes

- definir se `current_balance` sera cache derivado, valor sincronizado ou ambos;
- definir conciliacao entre lancamento manual e transacao importada;
- definir edicao permitida em dados sincronizados;
- confirmar representacao definitiva de transferencias;
- definir catalogo minimo de categorias do sistema;
- definir trilha de auditoria financeira;
- definir provider e contrato de idempotencia;
- criar modelo seguro de consentimento e conexao Open Finance;
- criar services de dominio antes de substituir qualquer mock.

## Proxima etapa segura

1. Revisar as migrations e este modelo.
2. Aplicar 002 e depois 003 somente no `UniFlow DEV`.
3. Executar a validacao estatica.
4. Criar fixtures descartaveis para papeis diferentes.
5. Validar RLS com cliente autenticado.
6. Corrigir por nova migration, sem editar migration aplicada.
7. Somente depois criar `financeService` e migrar um fluxo por vez.
