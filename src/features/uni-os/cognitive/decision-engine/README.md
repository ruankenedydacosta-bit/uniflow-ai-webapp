# Decision Engine V1

Camada cognitiva deterministica que transforma `reasoningPlan` e as secoes
permitidas do `compiledContext` em um `decisionPlan` estruturado.

## API publica

- `createDecisionPlan(input, options)` produz a decisao imutavel.
- `validateDecisionPlan(plan)` audita o contrato.
- `runDecisionEngineShadow(input, options)` observa e descarta o resultado.

## Entrada

```js
{
  reasoningPlan,
  compiledContext,
}
```

## Garantias

- clone defensivo antes de deep freeze;
- `executionAllowed` sempre `false`;
- provider agnostic;
- feature flag `UNI_OS_ENABLED` desligada;
- nenhuma API, IA, persistencia, prompt ou acao;
- nenhuma alteracao em Runtime, adapters ou fluxo legado.

## Limite da V1

O engine apenas seleciona codigos, referencias e copias de secoes ja
estruturadas. Ele nao decide pelo usuario e nao executa a decisao representada.
