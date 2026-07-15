# UniFlow Cognitive Live Chart V1

## Objetivo

Conectar a leitura da Uni à evolução visual de receitas e despesas sem transformar o gráfico em uma fonte de decisão automática. A V1 é uma feature compartilhada e puramente apresentacional.

## Variantes

- `compact`: usada na Home Mobile, depois do Próximo Passo e antes do Resumo Financeiro.
- `detailed`: usada no Financeiro Mobile, substituindo o SVG anterior de receitas e despesas.

As duas variantes usam o mesmo `CognitiveLiveChart`; não há implementações paralelas.

## Modos

- `overview`: receitas e despesas acumuladas.
- `uni-insight`: destaca um intervalo e apresenta uma leitura mockada da Uni.
- `comparison`: compara despesas com o período anterior.
- `forecast`: estende as séries com uma projeção mockada.

## Props principais

O componente aceita `variant`, `mode`, `defaultMode`, `period`, `defaultPeriod`, `data`, `forecastData`, `comparisonData`, `todayDay`, metadados de insights e callbacks locais. Dados recebidos por props têm prioridade; os mocks são fallback.

## Integrações

Na Home, a variante compact usa inicialmente `uni-insight`. No Financeiro, a variante detailed começa em `overview` e mantém seus seletores locais. O seletor global, saldo, contas, cartões, lançamentos, categorias, previsão e ação rápida financeira permanecem intactos.

O botão central da navegação continua sendo exclusivamente a entrada para `/uni-ai`.

## Limitações

A V1 não consulta Supabase, Open Finance, APIs, IA ou voz. Não calcula saldos nem produz previsões reais. Todos os dados exibidos atualmente são mocks estáticos.

## Evolução futura

A conexão futura com a Uni ocorrerá por props estruturadas, sem manipulação direta do SVG. Uma V2 visual poderá adaptar tokens do Design System, densidade, eixos e transições após validação em uso real, sem alterar o contrato cognitivo da V1.
