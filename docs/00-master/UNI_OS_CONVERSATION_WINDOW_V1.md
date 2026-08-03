# UNI OS Conversation Window V1

## Objetivo

O Conversation Window Manager seleciona o subconjunto elegivel do contexto cognitivo que podera alimentar etapas futuras de orquestracao. Ele nao gera prompt, nao resume conteudo e nao executa modelos.

## Arquitetura

O modulo esta em `src/features/uni-os/llm/conversation-window/` e possui cinco responsabilidades separadas:

- `windowPolicy`: limites deterministas por politica.
- `windowSelector`: selecao sem mutacao.
- `windowSchema`: clone defensivo e deep freeze.
- `windowValidator`: integridade, limites e invariantes.
- `conversationWindowManager`: composicao e modo sombra.

## Entradas e fluxo

O manager recebe `compiledContext` e `routingResult`. A politica e lida apenas de `routingResult.metadata.conversationWindowPolicy`, com fallback `NORMAL`.

O contexto compilado pode ser recebido como snapshot completo ou como o objeto interno `compiledContext`. Nenhum formato de origem e modificado.

## Politicas

As politicas definem somente quantidades maximas:

| Politica | Mensagens | Objetivos | Memorias | Contexto | Insights |
| --- | ---: | ---: | ---: | ---: | ---: |
| SHORT | 4 | 2 | 3 | 3 | 2 |
| NORMAL | 8 | 4 | 6 | 6 | 4 |
| LONG | 16 | 8 | 12 | 12 | 8 |
| FULL | Todos | Todos | Todos | Todos | Todos |

Mensagens usam os itens mais recentes e preservam sua ordem cronologica. Objetivos, memorias, contexto e insights preservam a ordem de relevancia recebida dos rankings e do Cognitive Context Builder.

## Informacoes obrigatorias

`reflection`, `security` e `permissions` nao sofrem truncamento. Esses snapshots estruturais permanecem completos em todas as politicas.

## Schema

O retorno contem `conversationWindow`, `statistics` e `metadata`. As colecoes selecionadas, contagens elegiveis e selecionadas, politica e limites sao explicitados. Todo o snapshot e profundamente imutavel.

## Garantias

- Nenhum snapshot de entrada e alterado ou congelado.
- Nenhuma ordenacao nova e inferida.
- Nenhuma informacao obrigatoria e removida.
- Nenhum resumo, prompt, texto ou chamada externa e produzido.
- Nenhum token e estimado ou consumido.
- Nenhum dado e persistido.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Quando ativado explicitamente em teste, o manager permite observacao tecnica e descarta o snapshot. Logs DEV contem somente contagens e a politica, nunca o conteudo selecionado.

## Limitacoes e roadmap

A V1 depende de colecoes ja elegiveis e ranqueadas. Ela nao mede tamanho textual nem orcamento de tokens. A proxima etapa, Token Budget Manager, podera aplicar limites quantitativos adicionais sem transformar esta camada em gerador de prompt.
