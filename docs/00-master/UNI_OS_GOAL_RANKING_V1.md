# UNI OS Goal Ranking Engine V1

## Objetivo

O Goal Ranking Engine seleciona a ordem de relevancia dos objetivos existentes para a conversa atual. Ele nao substitui o Goal Engine: recebe seu snapshot pronto e calcula somente uma classificacao contextual, sem alterar prioridade, estado ou conteudo dos objetivos.

## Arquitetura

O modulo isolado vive em `src/features/uni-os/cognitive/goal-ranking`.

- `goalRankingPolicy.js`: calcula score, motivos e ordenacao deterministica.
- `goalRankingSchema.js`: valida, clona e congela o contrato de saida.
- `goalRankingEngine.js`: coordena o ranking e o modo sombra.
- `index.js`: expoe a API publica local.

Nao existe integracao com runtime, Goal Engine, providers, Supabase ou interfaces.

## Entradas

- `parsedIntent`: intencao e entidades estruturadas;
- `contextSnapshot`: contexto de workspace somente leitura;
- `memorySnapshot`: memoria somente para corroborar referencias existentes;
- `goalSnapshot`: objetivos ja representados pelo Goal Engine.

As entradas nunca sao congeladas ou modificadas pelo ranking.

## Schema

```js
{
  rankedGoals: [{
    goalId,
    relevance,
    priority,
    score,
    reasons,
  }],
  primaryGoal,
  metadata,
}
```

A saida e profundamente imutavel. `primaryGoal` e o primeiro item do ranking ou `null` quando nao existem objetivos.

## Score

O score V1 e limitado ao intervalo de `0` a `100` e soma somente regras explicitas:

- objetivo ativo: 10 pontos;
- prioridade original: de 4 a 16 pontos;
- compatibilidade com intencao: 18 ou 30 pontos;
- compatibilidade com categoria estruturada: 22 pontos;
- compatibilidade com contexto pessoal ou empresarial: 12 pontos;
- prazo: 5, 10 ou 14 pontos;
- referencia corroborada na memoria: 4 pontos.

As faixas de relevancia sao `LOW` abaixo de 30, `MEDIUM` de 30 a 59 e `HIGH` a partir de 60.

## Criterios e desempate

O ranking considera compatibilidade de tipo com a intencao, entidades de categoria, tipo de workspace, status, prioridade e proximidade do prazo. Nao le texto original nem usa modelo probabilistico.

Empates sao resolvidos por:

1. prioridade original;
2. prazo mais proximo;
3. ordem original no `goalSnapshot`.

Nenhum objetivo e removido durante o ranking.

## Fluxo

```text
Snapshots somente leitura
  -> ler objetivos existentes
  -> pontuar cada referencia
  -> classificar relevancia
  -> ordenar com desempate estavel
  -> clonar e congelar
  -> snapshot de ranking
```

## Modo sombra

`runGoalRankingShadow()` usa a flag compartilhada `UNI_OS_ENABLED`, que continua desligada. Quando habilitado explicitamente para validacao, envia o snapshot a um observador e descarta o resultado. Nenhuma decisao chega ao produto.

## Garantias

- nenhum objetivo criado, removido ou alterado;
- prioridade original preservada;
- nenhuma escrita em memoria ou persistencia;
- nenhuma chamada de IA, API ou servico financeiro;
- nenhum efeito colateral;
- `executionAllowed`, `generatedGoals` e `mutatedGoals` sempre falsos.

## Limitacoes

A V1 usa um conjunto pequeno de correspondencias de intencao e categoria. Ela nao interpreta texto livre, nao aprende pesos, nao resolve conflitos entre objetivos e nao recomenda mudancas. Objetivos sem ID permanecem com `goalId: null`.

## Roadmap

Etapas futuras podem ampliar criterios deterministas, adicionar explicabilidade por componente e integrar o ranking ao runtime somente em modo sombra. Qualquer evolucao deve preservar a separacao entre relevancia conversacional, prioridade permanente e execucao.
