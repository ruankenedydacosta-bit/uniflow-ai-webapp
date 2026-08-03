# Cognitive Execution Plan V1

Agregador cognitivo deterministico que consolida `reasoningPlan`,
`decisionPlan` e `confidencePlan` em um unico snapshot imutavel.

Apesar do nome, o CEP nunca executa. `executionAllowed` permanece sempre
`false`.

## API publica

- `createCognitiveExecutionPlan(input, options)` consolida os planos.
- `validateCognitiveExecutionPlan(plan)` valida o contrato.
- `runCognitiveExecutionPlanShadow(input, options)` observa e descarta.

## Garantias

- clone defensivo e deep freeze;
- politicas conservadoras para ausencia, conflito, risco e confirmacao;
- provider agnostic;
- nenhuma API, SDK, IA, HTTP, prompt, persistencia ou acao;
- nenhuma integracao com Runtime ou fluxo legado.
