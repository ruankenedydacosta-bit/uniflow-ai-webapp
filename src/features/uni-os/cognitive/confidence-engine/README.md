# Confidence Engine V1

Camada cognitiva deterministica que avalia um `decisionPlan` e produz um
`confidencePlan` imutavel antes de qualquer futura construcao de prompt.

## API publica

- `createConfidencePlan(input, options)` produz o assessment.
- `validateConfidencePlan(plan)` valida o contrato.
- `runConfidenceEngineShadow(input, options)` observa e descarta o resultado.

## Garantias

- clone defensivo e deep freeze;
- cinco niveis de confianca;
- risco, ambiguidade, conflitos e lacunas explicitados por codigos;
- `safeToExecute` e `executionAllowed` sempre `false`;
- provider agnostic, sem API, SDK, IA, HTTP, prompt ou persistencia;
- nenhuma integracao com Runtime ou fluxo legado.

## Limite da V1

As pontuacoes sao heuristicas deterministicas. Elas nao representam probabilidade
estatistica e nunca autorizam execucao.
