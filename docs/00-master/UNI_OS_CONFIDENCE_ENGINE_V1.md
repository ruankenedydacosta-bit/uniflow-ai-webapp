# UNI OS Confidence Engine V1

## Objetivo

O Confidence Engine avalia a confianca do `decisionPlan` antes de qualquer
futura construcao de prompt.

```text
Compiled Context
      |
      v
Reasoning Planner
      |
      v
Decision Engine
      |
      v
Confidence Engine
      |
      v
Prompt Builder (integracao futura)
```

A V1 permanece isolada. Nenhum Runtime, adapter, Prompt Builder, Prompt
Compiler ou fluxo legado foi conectado ou modificado.

## Responsabilidade

O engine recebe somente o `decisionPlan` e produz um `confidencePlan`. Ele
avalia sinais ja estruturados e nunca corrige, completa ou modifica a decisao.

O engine nao gera texto, prompt, memoria, contexto, recomendacao em linguagem
natural ou acao.

## Contrato

O `confidencePlan` contem:

- `confidenceScore`;
- `confidenceLevel`;
- `confidenceReasons`;
- `missingInformation`;
- `conflictingSignals`;
- `uncertaintySources`;
- `requiresConfirmation`;
- `safeToRecommend`;
- `safeToExecute`, sempre `false`;
- `recommendedFollowUp`;
- `confidenceVersion`;
- `generatedAt`;
- `executionAllowed`, sempre `false`.

Todos os objetos publicos passam por clone defensivo e deep freeze.

## Niveis

- `VERY_LOW`: abaixo de 0,20;
- `LOW`: de 0,20 ate 0,39;
- `MEDIUM`: de 0,40 ate 0,59;
- `HIGH`: de 0,60 ate 0,79;
- `VERY_HIGH`: a partir de 0,80.

Os niveis sao heuristicas deterministicas, nao probabilidades estatisticas.

## Calculo

O score parte de `decisionConfidence` e aplica penalidades reproduziveis para:

- informacoes ausentes;
- sinais conflitantes;
- ambiguidade;
- risco;
- confirmacao pendente.

O score final e limitado ao intervalo de zero a um.

## Informacoes ausentes

O engine identifica ausencia de:

- decision plan;
- contexto selecionado;
- memoria selecionada;
- reasoning selecionado;
- referencia ao planner;
- capabilities recomendadas.

Ausencia de memoria e explicitada, mas nao cria nem infere memoria.

## Conflitos e incertezas

Conflitos estruturais incluem alta confianca com risco bloqueante, ambiguidade
nao esclarecida e intencao de execucao sem confirmacao.

As fontes de incerteza sao codigos, nunca frases geradas.

## Seguranca

`safeToRecommend` exige score suficiente, contexto, reasoning, ausencia de
risco bloqueante, ambiguidade alta e conflitos.

`safeToExecute` permanece sempre `false`. O Confidence Engine nao concede
permissao tecnica nem cognitiva para executar qualquer acao.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Quando ativado explicitamente em teste, o
engine permite observar o snapshot e retorna `confidencePlan: null`. O
resultado continua descartado.

## Garantias

- totalmente deterministico;
- provider agnostic;
- nenhum HTTP, SDK, API ou modelo;
- nenhuma geracao de texto ou prompt;
- nenhuma persistencia;
- nenhuma alteracao em Decision Engine, Runtime, adapters ou fluxo legado.

## Proximo passo

Criar uma orquestracao sombra para encadear Reasoning Planner, Decision Engine
e Confidence Engine, ainda sem fornecer o `confidencePlan` ao Prompt Builder
funcional.
