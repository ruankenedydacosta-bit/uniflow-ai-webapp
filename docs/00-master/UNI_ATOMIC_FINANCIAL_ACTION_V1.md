# Uni Atomic Financial Action V1

## Problema resolvido

O provisionamento conversacional criava conta e transação em duas chamadas
Supabase. Se a segunda escrita falhasse, a conta permanecia ativa. A migration
`20260712_008_atomic_financial_action.sql` prepara uma única RPC PostgreSQL para
executar as duas mudanças na mesma transação implícita.

As migrations 008 e 009 formam um conjunto: a 008 cria a operação atômica e a
009 corrige os grants do índice, fixa owners e adiciona o saldo derivado. A 008
não deve ser aplicada isoladamente. Produção permanece fora deste procedimento.

## Operação transacional

A RPC oficial é:

```text
public.execute_confirmed_financial_action(...)
```

Fluxo interno:

1. obtém `auth.uid()`;
2. deriva o workspace de `profiles.current_workspace_id`;
3. valida membership ativa com papel `owner`, `admin` ou `member`;
4. valida chave de idempotência, valor, tipo, descrição, data e categoria;
5. serializa a operação por advisory lock transacional;
6. retorna resultado anterior quando a mesma ação já foi concluída;
7. usa, cria ou reativa a conta conforme decisão confirmada;
8. cria a transação manual;
9. retorna somente IDs e indicadores mínimos.

Não há `BEGIN`, `COMMIT` ou `ROLLBACK` manual dentro da função. A chamada RPC é
uma transação PostgreSQL: qualquer exception desfaz criação, reativação e
transação juntas.

## Modos de conta

### `existing`

- exige `account_id`;
- bloqueia conta de outro workspace;
- bloqueia conta arquivada;
- cria somente a transação.

### `create`

- exige nome e tipo ativo no catálogo `account_types`;
- normaliza a identidade de forma equivalente ao domínio JavaScript;
- impede outra conta ativa equivalente no workspace;
- cria conta e transação atomicamente.

### `reactivate`

- exige `account_id` do workspace atual;
- exige que a conta esteja arquivada;
- impede conflito com outra conta ativa equivalente;
- reativa e cria a transação atomicamente;
- uma falha posterior mantém a conta arquivada por rollback.

## Idempotência

`transactions.client_operation_id` é UUID e possui índice único parcial com
`workspace_id`. O frontend autenticado não recebe grant de `INSERT` ou `UPDATE`
para essa coluna.

A chave é criada uma vez quando a ação conversacional nasce. Correções, clique
duplo e retry mantêm a mesma chave. A RPC:

- usa advisory lock por workspace e operação;
- retorna a transação anterior com `idempotent_replay = true` no retry igual;
- compara os campos financeiros e a conta antes de aceitar o replay;
- rejeita reutilização da chave com payload diferente.

## Concorrência de contas

A criação usa advisory lock por workspace e identidade normalizada. O índice
único `accounts_workspace_active_identity_uidx` é a barreira final contra
writers concorrentes, inclusive fora da RPC.

Contas arquivadas ficam fora do índice parcial. Uma nova conta equivalente só é
permitida após a decisão explícita `Criar nova`; reativar é bloqueado quando já
existe equivalente ativa.

## Segurança

A função usa `SECURITY DEFINER` porque `SECURITY INVOKER` exigiria liberar ao
frontend escrita direta em `client_operation_id`. As proteções obrigatórias são:

- `search_path = ''`;
- todas as tabelas qualificadas com schema;
- usuário derivado exclusivamente de `auth.uid()`;
- nenhum parâmetro `user_id` ou `workspace_id`;
- workspace derivado do profile e membership validada explicitamente;
- referências de conta, destino e categoria limitadas ao workspace atual ou ao
  catálogo global permitido;
- `PUBLIC` e `anon` sem `EXECUTE`;
- somente `authenticated` com `EXECUTE`;
- RLS existente permanece ativa;
- retorno sem profile, email, token, metadata ou payload interno.

Erros internos usam tokens controlados e o service os converte em mensagens
humanas. Nenhum SQL, ID interno sensível ou detalhe de policy aparece na UI.

## Saldo oficial derivado

`accounts.current_balance` permanece como campo legado/cache e não é fonte de
verdade contábil. A migration 009 cria duas RPCs somente leitura:

- `get_derived_account_balances()`;
- `get_derived_workspace_balance()`.

Nenhuma recebe `workspace_id`. Ambas derivam o workspace de
`profiles.current_workspace_id`, validam `auth.uid()` e membership ativa e
consideram somente transações com status `completed`.

O cálculo por conta é:

```text
initial_balance + income - expense + transfer_in - transfer_out
```

Uma transferência continua sendo uma única transação: debita `account_id` e
credita `destination_account_id`. Transações `pending`, `failed` e `canceled`
não afetam o saldo. Cancelar uma transação completed remove automaticamente seu
efeito do cálculo; restaurá-la para completed recompõe o saldo. Uma reversão
contábil formal com vínculo próprio continua fora da V1 e deve usar uma ação
compensatória explicitamente confirmada até existir modelo dedicado.

## Correção do índice de contas

O índice `accounts_workspace_active_identity_uidx` executa
`normalize_financial_account_identity(text)` durante INSERT/UPDATE. A migration
009 concede `EXECUTE` somente a `authenticated`, mantendo `PUBLIC` e `anon`
bloqueados. A função é `IMMUTABLE`, `SECURITY INVOKER`, não consulta tabelas e
não expõe dados; o grant serve exclusivamente à normalização determinística.

## Frontend

`confirmedFinancialActionService.js` monta os parâmetros explícitos da RPC sem
`user_id` ou `workspace_id`. Em Supabase configurado, o fluxo conversacional
usa somente esse service e recarrega `useAccounts` e `useTransactions` após
sucesso.

No modo demo, `accountProvisioning.js` continua criando conta, reativando e
criando transação no estado local. O demo não chama a RPC e não simula banco.

Falhas exibem a mensagem genérica de rollback:

> Não consegui concluir esse lançamento agora. Nada foi registrado e você pode
> tentar novamente.

## Auditoria e aplicação no DEV

1. Executar no SQL Editor do UniFlow DEV, antes da 008:
   `supabase/tests/atomic_financial_action_failed_apply_audit.sql`.
2. Exigir o resultado:
   `atomic_financial_action_ready_for_migration`.
3. Resolver previamente qualquer grupo de contas ativas equivalentes.
4. Aplicar manualmente somente no DEV:
   `supabase/migrations/20260712_008_atomic_financial_action.sql`.
5. Executar imediatamente:
   `supabase/tests/fix_atomic_financial_action_and_balances_failed_apply_audit.sql`.
6. Exigir `atomic_financial_action_fix_ready_for_migration`.
7. Aplicar manualmente somente no DEV:
   `supabase/migrations/20260716_009_fix_atomic_financial_action_and_balances.sql`.
8. Executar:
   `supabase/tests/atomic_financial_action_validation.sql`.
9. Exigir `49/49` checks verdadeiros.
10. Preparar dois usuários de teste com workspaces distintos.
11. Executar localmente:

```bash
node --env-file=.env.local scripts/supabase/test-atomic-financial-action.js
```

O script exige variáveis `SUPABASE_ATOMIC_USER_A_*` e
`SUPABASE_ATOMIC_USER_B_*`, bloqueia endpoints diferentes do UniFlow DEV e
rejeita `service_role`.

## Rollback da migration

Antes de qualquer rollback no DEV, confirmar que nenhum cliente depende da RPC.
A ordem manual futura deve ser revisada antes de execução:

1. revogar `EXECUTE` da RPC;
2. remover a RPC;
3. remover os dois índices novos;
4. remover a função de normalização;
5. remover `client_operation_id` somente se os dados de idempotência puderem ser
   descartados.

Nenhum `DROP` automático foi criado nesta etapa.

## Limites da V1

- aplicação permitida somente no DEV e sempre na ordem 008, 009 e validações;
- sem integração Open Finance;
- sem escrita automática em `current_balance`;
- sem modelo formal de vínculo entre transação original e reversão;
- sem confirmação por voz;
- somente ações manuais confirmadas de income, expense e transfer;
- teste autenticado precisa ser executado manualmente no DEV;
- produção permanece intacta.
