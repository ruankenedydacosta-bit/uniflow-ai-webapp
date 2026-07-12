# Teste autenticado da Memória Financeira V1

## Objetivo

Este roteiro valida RLS, grants e RPCs da migration 005 com dois usuários autenticados no `UniFlow DEV`. Ele usa somente anon/publishable key e sessões comuns. SQL Editor como `postgres` e `service_role` não validam as permissões reais do frontend.

O teste não cria usuários, workspaces ou memberships e não deve ser executado em produção.

## Pré-requisitos

1. Migration `20260711_005_uni_financial_memory.sql` aplicada no UniFlow DEV.
2. Dois usuários de teste diferentes criados manualmente em Supabase Auth.
3. Cada usuário com `profiles.current_workspace_id` preenchido.
4. Cada workspace com membership ativa do próprio usuário.
5. `.env.local` contendo apenas as variáveis locais necessárias e nunca versionado.

O script aceita exclusivamente o host conhecido do UniFlow DEV e bloqueia `service_role` e chaves `sb_secret_`.

## Variáveis

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_MEMORY_USER_A_EMAIL
SUPABASE_MEMORY_USER_A_PASSWORD
SUPABASE_MEMORY_USER_B_EMAIL
SUPABASE_MEMORY_USER_B_PASSWORD
```

Nunca salve senhas, tokens, sessões ou chaves no Git, Obsidian, documentação ou saída de terminal compartilhada.

## Execução

Com Node.js 20.6 ou superior:

```bash
node --env-file=.env.local scripts/supabase/test-memory-rls.js
```

Ou pelo script npm, quando as variáveis já estiverem exportadas no shell:

```bash
npm run supabase:test-memory-rls
```

## Cenários

- autenticação separada dos usuários A e B;
- leitura do profile e workspace atual de cada usuário;
- criação de memória explícita própria sem campos privilegiados;
- ownership, status, confiança e timestamps definidos pelo banco;
- leitura da memória pelo titular;
- bloqueio de `recurring_income`, `recurring_expense` e `spending_pattern` no frontend;
- bloqueio de `user_id`, `status`, `confidence` e timestamp protegidos no insert;
- bloqueio de `UPDATE` direto;
- decisão e correção de memória explícita própria pelas RPCs;
- bloqueio das RPCs para memória de outro usuário;
- isolamento de leitura, alteração e exclusão entre A e B;
- evidências sem `INSERT`, `UPDATE` ou `DELETE` frontend;
- limpeza dos dois registros temporários pelos respectivos titulares;
- `signOut` das duas sessões.

O bloqueio de correção de tipo inferido é protegido estruturalmente pela RPC. Como o frontend não possui permissão para criar tipos inferidos, este roteiro comprova primeiro que eles não podem ser inseridos e não fabrica uma fixture privilegiada. Uma validação backend futura poderá criar uma fixture inferida controlada para exercitar esse ramo diretamente.

## Resultado esperado

Cada linha deve aparecer como `[PASS]`. Qualquer falha crítica define exit code `1`. RLS pode bloquear uma operação com erro de permissão ou ocultar uma linha; o script diferencia esses comportamentos conforme a operação testada.

## Limpeza e limites

O teste usa chaves aleatórias prefixadas por `rls-test` e remove somente as duas memórias que criou. Não altera workspaces, memberships, profiles ou dados financeiros. Se a execução for interrompida antes do `finally`, procure apenas memórias com esse prefixo pertencentes aos usuários de teste e revise a remoção manual no DEV.

Este teste não valida backend automático, service role, memória inferida persistida, expiração automática, evidências criadas por Edge Function ou integração visual com a Uni.

## Estado

A migration 005 está aplicada no UniFlow DEV e passou em 21/21 verificações estruturais. Este teste autenticado permanece pendente até ser executado manualmente com as quatro credenciais locais. Produção permanece intacta.
