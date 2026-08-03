# Reasoning Planner V1

Camada cognitiva determinística que transforma o `compiledContext` em um
`reasoningPlan` estruturado. O módulo não gera texto, não cria prompts e não
executa ações.

## API pública

- `planReasoning(compiledContext, options)` produz um snapshot imutável.
- `validateReasoningPlan(plan)` audita o contrato.
- `runReasoningPlannerShadow(input, options)` observa e descarta o resultado.

## Garantias

- clone defensivo antes do deep freeze;
- `executionAllowed` sempre `false`;
- decisões determinísticas;
- feature flag `UNI_OS_ENABLED` desligada por padrão;
- nenhuma persistência, API, SDK, modelo ou consumo de tokens;
- nenhuma integração com Runtime, Prompt Builder ou pipelines atuais.

## Limite da V1

O planner apenas declara profundidade, estratégias, capacidades e seções
necessárias. Ele não valida fatos, não monta prompts e não escolhe modelos.
