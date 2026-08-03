# UNI OS Goal Engine V1

## Objetivo

O Goal Engine representa e organiza objetivos permanentes ja declarados pelo usuario. Ele prepara uma visao cognitiva deterministica para consumo futuro do UNI OS sem criar, editar, apagar, persistir ou executar objetivos.

## Arquitetura

O modulo vive em `src/features/uni-os/cognitive/goals` e permanece desconectado do runtime, Inspector, providers, Supabase e interfaces.

- `goalNormalizer.js`: converte formatos existentes para o contrato comum.
- `goalPrioritizer.js`: calcula prioridade e ordenacao deterministicas.
- `goalSchema.js`: valida forma, clona e aplica deep freeze.
- `goalEngine.js`: coordena leitura, filtro, prioridade e modo sombra.
- `index.js`: API publica local do modulo.

## Entradas

O engine aceita somente snapshots fornecidos pelo caller:

- `memorySnapshot`;
- `contextSnapshot`;
- `parsedIntent`.

Na V1, os objetivos sao lidos de `memorySnapshot.financial.goals` ou `memorySnapshot.goals`. Contexto e intencao permanecem disponiveis como entradas somente leitura, mas nao mudam a prioridade nesta versao.

## Schema

```js
{
  goals: [{
    id,
    type,
    title,
    priority,
    progress,
    status,
    targetValue,
    currentValue,
    deadline,
    confidence,
  }],
  primaryGoal,
  metadata,
}
```

O snapshot e profundamente imutavel. O engine nao inventa IDs: quando a origem nao fornece identificador, `id` permanece `null`.

## Tipos

- `Savings`;
- `Investment`;
- `EmergencyFund`;
- `DebtReduction`;
- `IncomeGrowth`;
- `BusinessGrowth`;
- `Custom`.

## Status

O normalizador reconhece `ACTIVE`, `PAUSED`, `COMPLETED` e `ARCHIVED`. A saida do engine contem somente objetivos `ACTIVE`; os demais continuam intactos na origem e nao sao apagados.

## Priorizacao

As prioridades sao `LOW`, `NORMAL`, `HIGH` e `CRITICAL`.

A regra V1 e deterministica:

1. preservar prioridade explicita valida;
2. elevar prazo vencido para `CRITICAL`;
3. garantir no minimo `HIGH` para prazo dentro de 30 dias;
4. garantir no minimo `HIGH` para `EmergencyFund` e `DebtReduction`;
5. ordenar por prioridade, depois prazo e finalmente ordem original.

O primeiro item ordenado torna-se `primaryGoal`. Nenhum modelo ou inferencia probabilistica participa.

## Fluxo

```text
Snapshots somente leitura
  -> extrair objetivos existentes
  -> normalizar
  -> selecionar ACTIVE
  -> priorizar
  -> ordenar
  -> clonar e congelar
  -> snapshot cognitivo
```

## Modo sombra

`runGoalEngineShadow()` usa `UNI_OS_ENABLED`. Com a flag desligada retorna `DISABLED`. Quando habilitado explicitamente, entrega o snapshot ao `observer`, descarta o resultado e nunca altera o sistema.

## Garantias

- nenhum objetivo criado automaticamente;
- nenhuma escrita em memoria;
- nenhuma persistencia;
- nenhuma acao financeira;
- nenhuma chamada de API ou IA;
- nenhuma alteracao dos snapshots recebidos;
- `executionAllowed`, `persisted` e `generatedGoals` sempre falsos.

## Limitacoes

A V1 nao acompanha historico de progresso, nao detecta conflitos entre objetivos, nao reserva recursos, nao sugere metas e nao utiliza contexto para mudar prioridades. Datas usam o formato `YYYY-MM-DD` e progresso e normalizado entre `0` e `1`.

## Roadmap futuro

Etapas futuras podem adicionar dependencias entre objetivos, restricoes de capacidade, marcos e acompanhamento temporal. Essas evolucoes devem continuar separando representacao cognitiva, persistencia e execucao, com consentimento explicito para qualquer mudanca de dados.
