# UNI OS LLM Adapter Mock V1

## Objetivo

O LLM Adapter Mock valida o contrato de adaptadores do UNI OS antes de qualquer integracao com inteligencia artificial real. Ele implementa todos os metodos obrigatorios, mas opera inteiramente em memoria e de forma deterministica.

## Arquitetura

O modulo esta em `src/features/uni-os/llm/adapters/mock/` e depende somente da LLM Adapter Interface, do catalogo oficial de capabilities e da feature flag compartilhada do UNI OS.

O fluxo representacional e:

1. `initialize()` habilita o ciclo de vida local.
2. `buildRequest()` cria um envelope profundamente imutavel.
3. `invoke()` seleciona uma resposta mock pelo identificador da capability.
4. `validateResponse()` verifica schema, provider, capability, integridade e imutabilidade.
5. `dispose()` encerra o estado local.

Nenhuma etapa realiza transporte externo ou raciocinio.

## Contrato implementado

O adapter implementa `initialize`, `dispose`, `healthCheck`, `supportsCapability`, `estimateCost`, `estimateLatency`, `buildRequest`, `invoke` e `validateResponse`.

## Capabilities

As respostas simuladas cobrem raciocinio geral e financeiro, classificacao, resumo, explicacao, recomendacao, previsao, analise de objetivos e insights, documentos, visao, OCR, voz, calculo, brainstorming e conversa.

`LONG_TERM_PLANNING` permanece fora do mock V1 porque nao integra a lista definida para esta etapa.

## Health e latencia

Health aceita `UNKNOWN`, `HEALTHY`, `DEGRADED` e `OFFLINE`. O estado offline produz falha controlada.

Latencia aceita `FAST`, `NORMAL`, `SLOW` e `TIMEOUT`. Os delays locais sao limitados a poucos milissegundos; `estimatedLatency` representa o perfil e nao o tempo real de espera. Timeout gera resposta estruturada sem chamada externa.

## Schema de resposta

Cada resposta contem `provider`, `capability`, `status`, `response`, `estimatedTokens`, `estimatedCost`, `estimatedLatency` e `metadata`. O objeto e criado por clone defensivo e deep freeze.

`estimatedTokens` e apenas uma estimativa mock. `metadata.tokensConsumed` permanece sempre zero.

## Modo sombra

`UNI_OS_ENABLED` continua `false`. Quando habilitado explicitamente para teste, o adapter executa a simulacao local, permite observacao tecnica e descarta a resposta. Nenhuma decisao chega ao fluxo do produto.

## Garantias e limitacoes

- Nenhum modelo, provider real, endpoint, SDK, HTTP ou credencial e conhecido.
- Nenhum token e consumido.
- Nenhuma linguagem inteligente e gerada.
- Nenhum snapshot de entrada e alterado.
- O mock nao mede qualidade de modelos nem representa disponibilidade externa.

## Roadmap

O proximo passo e conectar um Prompt Builder ao contrato e ao adapter mock, ainda sem provider real. Integracoes externas somente devem surgir depois de request schema, sanitizacao, observabilidade, limites de custo e revisao de seguranca.
