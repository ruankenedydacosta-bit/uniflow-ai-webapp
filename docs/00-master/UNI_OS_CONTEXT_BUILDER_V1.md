# UNI OS Cognitive Context Builder V1

## Objetivo

O Cognitive Context Builder compila o conhecimento estruturado produzido pelo UNI OS em um único contrato preparado para consumo futuro por modelos cognitivos. Nesta versão ele não monta prompts, não chama modelos e não produz linguagem natural.

## Arquitetura

O módulo isolado vive em `src/features/uni-os/cognitive/context-builder`.

- `contextFilter.js`: valida elegibilidade e remove campos proibidos.
- `contextCompressor.js`: remove duplicidades e itens irrelevantes ou expirados.
- `contextCompiler.js`: organiza as nove seções do contexto.
- `contextBuilderSchema.js`: valida, clona e aplica deep freeze.
- `cognitiveContextBuilder.js`: coordena compilação e modo sombra.
- `index.js`: API pública local.

Não existe integração com Runtime, Gateway, Inspector, providers ou APIs.

## Entradas

- `parsedIntent`;
- `goalRanking`;
- `memoryRanking`;
- `contextRanking`;
- `insights`;
- `planning`;
- `reflection`;
- `security`;
- `permissions`.

Todos os snapshots são recebidos somente para leitura.

## Schema

```js
{
  compiledContext: {
    conversation,
    goals,
    memory,
    context,
    insights,
    planning,
    reflection,
    security,
    permissions,
  },
  statistics,
  metadata,
}
```

O contrato completo é profundamente imutável.

## Filtros

O builder rejeita:

- objetivos sem referência ou score relevante;
- memórias inelegíveis, com score abaixo do limiar ou expiradas;
- contextos inválidos, sem valor ou expirados;
- insights sem identificador;
- funções, símbolos, referências circulares e valores indefinidos;
- prompts, tokens, segredos, transcrições e texto bruto.

Os filtros não alteram as entradas.

## Compressão

Coleções são deduplicadas por `goalId`, `memoryId`, chave de contexto e `insightId`. Quando há duplicidade, o item de maior score é preservado; empates mantêm a primeira ocorrência.

Não existe limite arbitrário ou truncamento na V1. `NO_INSIGHT` é mantido apenas quando não existe insight acionável. As estatísticas registram contagens de entrada, saída, duplicidades e filtros.

## Fluxo

```text
Snapshots somente leitura
  -> sanitizar estrutura
  -> validar elegibilidade
  -> remover duplicidades
  -> compilar seções
  -> clonar e congelar
  -> compiledContext
```

## Modo sombra

`runCognitiveContextBuilderShadow()` usa `UNI_OS_ENABLED`, que continua desligada. Quando habilitado explicitamente, entrega o snapshot a um observador e descarta o resultado. O fluxo legado permanece inalterado.

## Garantias

- nenhuma criação de prompt;
- nenhuma geração de texto;
- nenhuma chamada a modelos ou APIs;
- nenhuma alteração de snapshots;
- nenhuma persistência ou execução;
- nenhuma alteração em engines ou rankings;
- compressão inteiramente determinística;
- saída profundamente imutável.

## Limitações

A V1 depende da qualidade dos snapshots recebidos e não reinterpreta seu conteúdo. Ela não estima orçamento de tokens, não resume semanticamente e não decide quais dados um modelo deve usar. Planning e validações são preservados como estruturas sanitizadas.

## Roadmap

Etapas futuras podem integrar o builder ao Runtime somente em modo sombra, criar orçamento estrutural explícito e conectar `compiledContext` ao Cognitive Gateway. A construção de prompts e seleção de modelos devem permanecer módulos separados e auditáveis.
