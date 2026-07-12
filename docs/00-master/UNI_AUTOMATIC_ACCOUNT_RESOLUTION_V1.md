# Uni Automatic Account Resolution V1

## Objetivo

A Uni resolve contas financeiras mencionadas em texto ou voz sem obrigar o
usuário a interromper a conversa para abrir o módulo Financeiro. A resolução
reutiliza o parser, os hooks financeiros e a confirmação existente.

Nenhuma conta ou transação é criada durante a interpretação. A escrita começa
somente depois do botão `Confirmar e registrar`.

## Fluxo oficial

```text
texto ou voz
  -> sendMessage
  -> parser financeiro
  -> memória permitida
  -> resolução de conta
  -> confirmação visual
  -> criação/reativação opcional da conta
  -> criação da transação
```

Voz e texto continuam usando exatamente o mesmo contrato. O microfone não
possui regras próprias de conta.

## Conta ativa existente

O resolver compara a menção somente por identidade normalizada exata:

- ignora maiúsculas e minúsculas;
- ignora acentos;
- compacta espaços e separadores;
- remove descritores neutros como `conta`, `cartão`, `banco` e `carteira` para
  a identidade;
- não usa similaridade vaga ou seleção por substring.

Assim, `Nubank`, `nubank` e `Nu Bank` podem resolver a mesma identidade. Quando
há uma única correspondência ativa por nome ou instituição, seu `account_id` é
usado no resumo e nenhuma duplicata é criada.

## Conta inexistente

Quando não há correspondência ativa ou arquivada, a Uni cria apenas um
`proposedAccount` em memória. O card informa `será criada` e mantém valor,
categoria, descrição e data visíveis.

O tipo é escolhido exclusivamente entre os tipos ativos já carregados do
catálogo:

- menção a cartão: `credit_card`, quando disponível;
- menção a poupança: `savings`, quando disponível;
- menção a conta corrente: `checking`, quando disponível;
- menção genérica como `pelo Nubank`: `digital_wallet`, com fallback para
  `checking`, `other` ou primeiro tipo ativo.

O usuário pode corrigir nome e tipo antes da confirmação. Nenhum tipo novo é
inventado ou inserido no catálogo.

## Confirmação única e duplicidade

Após a confirmação:

1. `useAccounts.saveAccount` cria a conta pelo workspace atual;
2. o ID retornado é aplicado ao payload validado;
3. `useTransactions.saveTransaction` cria a movimentação;
4. o estado de contas recebe a nova conta e conversas seguintes a reutilizam.

`useUniConversation` mantém uma promessa de confirmação em andamento e
`createAccountProvisioningCoordinator` aplica single-flight. Cliques repetidos
durante a mesma execução compartilham a operação e não criam duas contas.

## Conta arquivada

Uma correspondência arquivada nunca recebe lançamento automaticamente. O card
mantém o resumo financeiro e oferece:

- `Reativar e usar`;
- `Criar nova`;
- `Cancelar`.

Reativação e criação acontecem somente após essa escolha e a confirmação
financeira posterior. Criar uma nova conta após o conflito é uma decisão
explícita, não uma duplicação silenciosa.

## Ambiguidade

Quando mais de uma conta ativa possui a mesma identidade normalizada, nenhuma é
escolhida silenciosamente. O seletor exibe apenas as correspondências válidas e
preserva valor, categoria, descrição e data enquanto o usuário decide.

## Modo demo

Sem Supabase:

- `useAccounts` cria a conta no estado React local;
- `useTransactions` cria a movimentação no estado local;
- a próxima conversa da sessão reutiliza a conta criada;
- recarregar restaura os mocks;
- nenhuma chamada remota é realizada.

O catálogo demo usa os mesmos códigos da migration de tipos de conta.

## Supabase e segurança

Com Supabase configurado:

- `UniAIPage` fornece somente callbacks dos hooks ligados ao workspace do
  `SessionContext`;
- o domínio conversacional não recebe `workspace_id` ou `user_id`;
- `accountService` e `transactionService` aplicam o workspace atual;
- RLS continua validando membership e papel;
- nenhuma conta de outro workspace pode ser selecionada pelo resolver;
- conta arquivada exige reativação explícita;
- erros técnicos são convertidos em mensagens humanas.

Não foi necessária migration. Os grants e policies atuais já permitem a criação
manual controlada de contas e transações para membros autorizados.

## Falhas parciais

Se a criação da conta falhar, a transação não é tentada. Se a conta for criada e
a transação falhar, a conta confirmada permanece ativa e será reutilizada na
próxima tentativa. Isso evita criar uma segunda conta, mas revela um limite da
V1: as duas escritas ainda não são uma transação atômica no banco.

Uma RPC transacional poderá ser avaliada futuramente somente com migration,
RLS e testes próprios. Esta etapa não altera o banco.

## Limites da V1

- resolução determinística, sem LLM ou API externa;
- sem busca aproximada por nomes;
- sem criação automática de novos tipos de conta;
- sem confirmação por voz;
- sem operação atômica entre criação da conta e lançamento;
- sem Open Finance;
- sem persistência do modo demo após recarregar.
