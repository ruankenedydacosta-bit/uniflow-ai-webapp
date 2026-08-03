# UNI OS Cognitive Execution Plan V1

## Objetivo

O Cognitive Execution Plan (CEP) consolida os tres snapshots cognitivos
produzidos antes da futura construcao de prompt.

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
Cognitive Execution Plan
      |
      v
Prompt Builder (integracao futura)
```

O nome execution plan descreve uma representacao cognitiva. A V1 nao executa
acoes e nao foi conectada ao Runtime ou Prompt Builder.

## Entrada

O CEP recebe somente snapshots prontos:

- `reasoningPlan`;
- `decisionPlan`;
- `confidencePlan`.

Ele nao chama os planners e nao modifica seus resultados.

## Contrato

O `cognitiveExecutionPlan` contem:

- os tres planos clonados;
- `effectiveStrategy`;
- `effectiveCapabilities`;
- `effectiveRisk`;
- `effectiveConfidence`;
- `effectiveReasoningDepth`;
- `communicationObjective`;
- `followUpStrategy`;
- `plannerVersion`;
- `generatedAt`;
- `executionAllowed`, sempre `false`;
- metadados de planos ausentes, conflitos e versoes de origem.

Todo o contrato passa por clone defensivo e deep freeze.

## Politicas de precedencia

1. Todos os planos ausentes: `SAFE_FALLBACK`.
2. Ausencia parcial: `REQUEST_CLARIFICATION`.
3. Conflito estrutural: `RESOLVE_CONFLICTS`.
4. Risco alto ou critico: `DEFER_FOR_RISK_REVIEW`.
5. Confirmacao pendente: `REQUIRE_CONFIRMATION`.
6. Recomendacao segura: `RECOMMEND_ONLY`.
7. Demais casos: `GUIDE_ONLY`.

Nenhuma estrategia autoriza execucao.

## Valores efetivos

### Capabilities

Somente capabilities presentes simultaneamente no Reasoning Planner e no
Decision Engine permanecem efetivas.

### Confianca

O CEP usa o menor valor valido entre alvo do reasoning, confianca da decisao e
score do Confidence Engine.

### Risco

O maior risco entre reasoning e decisao prevalece. Conflitos elevam o risco
minimo para `HIGH`.

### Profundidade

A profundidade original e preservada, mas risco alto exige no minimo `HIGH` e
risco critico exige `VERY_HIGH`.

## Conflitos

A V1 detecta:

- divergencia de versao do planner;
- divergencia de intent;
- conflitos reportados pelo Confidence Engine;
- recomendacao marcada como segura diante de risco bloqueante;
- divergencia sobre confirmacao obrigatoria.

Conflitos nunca sao corrigidos automaticamente.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Quando habilitado explicitamente em teste,
o CEP permite observar o snapshot e retorna `cognitiveExecutionPlan: null`.
O resultado e descartado.

## Garantias

- deterministico e provider agnostic;
- nenhum HTTP, SDK, API ou modelo;
- nenhuma geracao de texto ou prompt;
- nenhuma persistencia;
- nenhuma alteracao em planners, Runtime, Prompt Builder, Prompt Compiler,
  adapters ou fluxo legado;
- `executionAllowed: false` como invariante.

## Proximo passo

Criar uma orquestracao cognitiva sombra que produza os tres planos e o CEP em
sequencia, ainda sem encaminhar o resultado ao Prompt Builder funcional.
