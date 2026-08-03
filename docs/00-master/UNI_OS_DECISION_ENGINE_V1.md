# UNI OS Decision Engine V1

## Objetivo

O Decision Engine transforma o `reasoningPlan` em um `decisionPlan`
estruturado. Ele ocupa a fronteira cognitiva entre o Reasoning Planner e uma
futura integracao com o Prompt Builder.

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
Prompt Builder (integracao futura)
```

A V1 permanece isolada. Nenhum Runtime, adapter, pipeline ou fluxo funcional
foi conectado ou modificado.

## Responsabilidade

O engine recebe:

- `reasoningPlan`, que define profundidade, risco, ambiguidade e necessidades;
- `compiledContext`, usado somente para copiar as secoes requeridas pelo plano.

O engine produz exclusivamente o `decisionPlan`. Ele nunca gera linguagem
natural, prompt, memoria, insight, objetivo ou acao.

## Contrato

O `decisionPlan` contem:

- `primaryDecision`;
- `decisionType`;
- `decisionConfidence`;
- `selectedStrategy`;
- `selectedReasoning`;
- `selectedInsights`;
- `selectedGoals`;
- `selectedContext`;
- `selectedMemory`;
- `recommendedCapabilities`;
- `executionIntent`;
- `confirmationRequired`;
- `riskAssessment`;
- `ambiguityAssessment`;
- `fallbackStrategy`;
- `explanationLevel`;
- `communicationObjective`;
- `plannerReference`;
- `engineVersion`;
- `generatedAt`;
- `executionAllowed`, sempre `false`.

Todos os campos publicos passam por clone defensivo e deep freeze.

## Decision Types

- `DIRECT_RESPONSE`;
- `FINANCIAL_ACTION_CONFIRMATION`;
- `FINANCIAL_ANALYSIS`;
- `GOAL_GUIDANCE`;
- `CONFIGURATION_CHANGE`;
- `SAFETY_GUIDANCE`;
- `CLARIFICATION_REQUEST`.

## Estrategias

- `DIRECT`;
- `CONFIRM_FIRST`;
- `EVIDENCE_WEIGHTED`;
- `GOAL_ALIGNED`;
- `PRESERVE_PREFERENCE`;
- `SAFETY_FIRST`;
- `CLARIFY_FIRST`.

As estrategias sao codigos representacionais. Nenhuma delas executa uma acao.

## Confianca, risco e ambiguidade

A confianca parte do alvo definido pelo Reasoning Planner e recebe penalidades
deterministicas por risco e ambiguidade. O resultado permanece entre zero e um.

Risco alto ou critico marca o assessment como bloqueante. Ambiguidade media ou
alta sempre produz `CLARIFICATION_REQUEST`. Entrada sem planner valido tambem
usa esse fallback seguro, com confianca zero.

## Confirmacao e execucao

Acoes financeiras sempre produzem:

- `confirmationRequired: true`;
- `executionIntent: AWAIT_CONFIRMATION`;
- `executionAllowed: false`.

`executionIntent` descreve somente a intencao futura. Ele nao autoriza nem
dispara qualquer operacao.

## Selecao de contexto

O engine copia somente as secoes listadas no `reasoningPlan`. Nao remove,
edita, ranqueia ou congela os objetos de entrada. Insights, goals, contexto e
memoria originais permanecem intactos.

## Validacao

O validator verifica enums, capacidades oficiais, collections, confianca,
versao, timestamp, imutabilidade e a invariante `executionAllowed: false`.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Quando ativado explicitamente em teste, o
engine permite observar o snapshot, mas retorna `decisionPlan: null`. O
resultado continua descartado e nao se torna fonte de verdade.

## Garantias

- totalmente deterministico;
- provider agnostic;
- nenhum HTTP, SDK, modelo ou API;
- nenhuma geracao de texto ou prompt;
- nenhuma persistencia;
- nenhuma alteracao em Prompt Builder, Prompt Compiler, Runtime, adapters,
  rankings ou fluxo legado.

## Proximo passo

Criar uma orquestracao sombra explicita que encadeie Cognitive Context Builder,
Reasoning Planner e Decision Engine, ainda sem fornecer o `decisionPlan` ao
Prompt Builder funcional.
