# UNI OS Token Budget V1

## Objetivo

O Token Budget Manager calcula quanto orcamento cognitivo cada secao da Conversation Window podera consumir futuramente. Ele nao reduz a janela, nao gera prompt e nao executa modelos.

## Arquitetura

O modulo esta em `src/features/uni-os/llm/token-budget/`:

- `budgetPolicy`: totais e pesos deterministas.
- `budgetEstimator`: estimativa estrutural aproximada.
- `budgetAllocator`: distribuicao e reaproveitamento de capacidade.
- `budgetSchema`: contrato imutavel.
- `budgetValidator`: limites, consistencia e invariantes.
- `tokenBudgetManager`: composicao e modo sombra.

## Politicas

| Politica | Orcamento total aproximado |
| --- | ---: |
| ECONOMY | 2.048 |
| BALANCED | 4.096 |
| QUALITY | 8.192 |
| MAX_CONTEXT | 16.384 |

Cada politica distribui pesos entre mensagens, objetivos, memoria, contexto, insights, reflection, security e permissions. Os pesos nao selecionam ou removem dados; representam somente limites futuros.

## Estimativas

O estimador percorre tipos, chaves e comprimentos de strings com uma razao fixa de quatro caracteres por unidade aproximada. Numeros e booleanos possuem custo estrutural constante. Referencias repetidas sao ignoradas para evitar contagem recursiva.

Isso nao e tokenizacao e nao representa precificacao de um modelo. Nenhum tokenizer, SDK, provider ou API e consultado.

## Distribuicao

Primeiro, cada secao recebe ate o limite definido pelo peso da politica e por sua demanda estimada. Capacidade nao usada e redistribuida deterministicamente entre secoes ainda nao atendidas. A soma nunca ultrapassa o budget total.

Janelas vazias recebem alocacao zero e preservam todo o budget como restante. Quando a demanda supera o maximo, o budget e integralmente alocado sem alterar a Conversation Window.

## Schema

O retorno contem `tokenBudget`, `version` e `metadata`. O budget inclui total, alocado, restante, secoes, estatisticas de demanda e metadados da politica. Todo o snapshot usa deep freeze.

## Garantias

- A Conversation Window nao e modificada nem congelada pelo manager.
- Nenhuma mensagem e removida.
- Nenhum contexto e reduzido ou resumido.
- Nenhum prompt ou texto e produzido.
- Nenhum modelo ou API externa e chamado.
- Nenhum token real e consumido.
- Nenhum dado e persistido.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Quando ativado explicitamente em teste, o resultado pode ser observado tecnicamente e e descartado. Logs DEV contem somente politica e totais agregados.

## Limitacoes e roadmap

A V1 estima estrutura, nao tokens reais. O futuro Prompt Builder podera consumir simultaneamente Conversation Window, Token Budget e Routing Result. Uma eventual tokenizacao especifica de provider exigira camada propria, revisao de custo e integracao segura posterior.
