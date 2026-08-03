# UNI OS Context Ranking Engine V1

## Objetivo

O Context Ranking Engine ordena elementos já presentes no contexto atual pela relevância para a conversa. Ele não cria contexto e não substitui o Context Adapter: recebe seu snapshot somente leitura e produz uma projeção priorizada, determinística e imutável.

## Arquitetura

O módulo vive isolado em `src/features/uni-os/cognitive/context-ranking`.

- `contextRankingPolicy.js`: extrai campos permitidos, valida elegibilidade, calcula score e ordena.
- `contextRankingSchema.js`: valida, clona e congela o contrato de saída.
- `contextRankingEngine.js`: coordena o ranking e o modo sombra.
- `index.js`: API pública local.

Não existe integração com Runtime, Inspector, Context Adapter, providers, Supabase ou interfaces.

## Entradas

- `parsedIntent`: intenção, idioma e canal estruturados;
- `contextSnapshot`: contexto atual;
- `goalSnapshot` e `goalRankingSnapshot`: somente sinais da existência de objetivo principal;
- `memoryRankingSnapshot`: somente sinal do tipo da memória mais relevante.

Objetivos e memórias não são convertidos em novos contextos.

## Elementos permitidos

A V1 pode ranquear:

- autenticação e estado da sessão;
- conclusão do perfil e modo do usuário;
- workspace ativo, role e tipo;
- canal, idioma e timezone;
- modo de personalidade;
- feature flags existentes;
- itens adicionais explicitamente presentes em `contextSnapshot.items`.

`sessionId` e `user.id` não entram na saída.

## Elegibilidade

Cada elemento precisa ter chave, valor e timestamp válidos. Datas de expiração, quando presentes, precisam ser válidas e futuras. Elementos com escopo de workspace só entram quando o identificador corresponde exatamente ao workspace ativo.

Contextos inválidos, expirados ou de outro workspace são descartados antes do score e nunca podem ser recuperados por relevância alta.

## Schema

```js
{
  rankedContext: [{
    key,
    value,
    relevance,
    score,
    reasons,
  }],
  primaryContext,
  metadata,
}
```

A saída é profundamente imutável. `primaryContext` referencia o primeiro item ou é `null`.

## Score

O score V1 é limitado entre `0` e `100` e usa somente regras explícitas:

- base de elemento válido: 5 pontos;
- intenção compatível: 15 ou 20 pontos;
- workspace ativo: 15 ou 25 pontos;
- modo do usuário: 12 pontos;
- canal: 8 ou 18 pontos;
- idioma: 7 ou 15 pontos;
- sessão ativa: 15 ou 20 pontos;
- recência: 3, 6 ou 10 pontos;
- objetivo principal disponível: 10 pontos;
- memória relevante compatível: 10 pontos.

As faixas são `LOW` abaixo de 30, `MEDIUM` de 30 a 59 e `HIGH` a partir de 60.

## Ordenação

O ranking usa maior score, elemento mais recente e ordem original como desempate estável. Nenhum valor original é reescrito.

## Fluxo

```text
Snapshots somente leitura
  -> extrair campos existentes permitidos
  -> validar tipo, timestamp, expiração e workspace
  -> calcular score determinístico
  -> ordenar
  -> clonar e congelar
```

## Modo sombra

`runContextRankingShadow()` compartilha `UNI_OS_ENABLED`, que continua desligada. Quando habilitado explicitamente, entrega o snapshot ao observador e descarta o resultado. O fluxo legado permanece como única fonte de verdade.

## Garantias

- nenhuma criação, edição, remoção ou persistência de contexto;
- nenhuma alteração do `SessionContext`;
- nenhum acesso a adapters, providers ou serviços;
- nenhuma IA, API ou ação;
- isolamento por workspace anterior ao score;
- metadados de criação, mutação, persistência e execução sempre falsos.

## Limitações

A V1 reconhece apenas campos estruturados e não interpreta texto livre. Contextos canônicos compartilham a recência do snapshot. Sinais de objetivos e memórias apenas ajustam score; não adicionam conteúdo. Esta camada não é uma fronteira de autorização.

## Roadmap

Etapas futuras podem ampliar critérios estruturados e integrar o ranking ao Runtime somente em modo sombra. Qualquer ativação comportamental exige revisão separada de privacidade, autorização e regressão.
